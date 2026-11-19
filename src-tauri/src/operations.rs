use rusqlite::{params, Connection, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerSummary {
    pub id: i64,
    pub name: String,
    pub phone: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleSummary {
    pub id: i64,
    pub invoice_number: String,
    pub customer_name: Option<String>,
    pub sold_at: String,
    pub total_minor: i64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailySales {
    pub date: String,
    pub total_minor: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSummary {
    pub today_sales_minor: i64,
    pub today_orders: i64,
    pub stock_units: i64,
    pub low_stock_count: i64,
    pub recent_sales: Vec<SaleSummary>,
    pub daily_sales: Vec<DailySales>,
}

pub fn dashboard(connection: &Connection) -> Result<DashboardSummary, rusqlite::Error> {
    let today_sales_minor = connection.query_row(
        "SELECT COALESCE(SUM(total_minor), 0) FROM sales
         WHERE sold_at >= strftime('%Y-%m-%dT00:00:00.000Z', 'now')
           AND status = 'paid'",
        [],
        |row| row.get(0),
    )?;
    let today_orders = connection.query_row(
        "SELECT COUNT(*) FROM sales
         WHERE sold_at >= strftime('%Y-%m-%dT00:00:00.000Z', 'now')
           AND status != 'cancelled'",
        [],
        |row| row.get(0),
    )?;
    let stock_units = connection.query_row(
        "SELECT COALESCE(SUM(balance), 0) FROM (
            SELECT products.id, COALESCE(SUM(stock_movements.delta_units), 0) AS balance
            FROM products
            LEFT JOIN batches ON batches.product_id = products.id
                               AND batches.expiry_date >= date('now', 'localtime')
            LEFT JOIN stock_movements ON stock_movements.batch_id = batches.id
            WHERE products.is_enabled = 1
            GROUP BY products.id
         )",
        [],
        |row| row.get(0),
    )?;
    let low_stock_count = connection.query_row(
        "SELECT COUNT(*) FROM (
            SELECT products.id
            FROM products
            LEFT JOIN batches ON batches.product_id = products.id
                               AND batches.expiry_date >= date('now', 'localtime')
            LEFT JOIN stock_movements ON stock_movements.batch_id = batches.id
            WHERE products.is_enabled = 1
            GROUP BY products.id
            HAVING COALESCE(SUM(stock_movements.delta_units), 0) <= products.reorder_level_units
         )",
        [],
        |row| row.get(0),
    )?;

    let mut statement = connection.prepare(
        "SELECT sales.id, sales.invoice_number,
                customers.name, sales.sold_at,
                sales.total_minor, sales.status
         FROM sales
         LEFT JOIN customers ON customers.id = sales.customer_id
         ORDER BY sales.sold_at DESC
         LIMIT 8",
    )?;
    let recent_sales = statement
        .query_map([], |row| {
            Ok(SaleSummary {
                id: row.get(0)?,
                invoice_number: row.get(1)?,
                customer_name: row.get(2)?,
                sold_at: row.get(3)?,
                total_minor: row.get(4)?,
                status: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let daily_sales = (0_i64..7)
        .map(|offset| {
            let date: String = connection.query_row(
                "SELECT strftime('%Y-%m-%d', 'now', ?1)",
                [format!("-{offset} days")],
                |row| row.get(0),
            )?;
            let total_minor = connection.query_row(
                "SELECT COALESCE(SUM(total_minor), 0) FROM sales
                 WHERE substr(sold_at, 1, 10) = ?1 AND status = 'paid'",
                [&date],
                |row| row.get(0),
            )?;
            Ok(DailySales { date, total_minor })
        })
        .collect::<Result<Vec<_>, rusqlite::Error>>()?;
    let daily_sales = daily_sales.into_iter().rev().collect();

    Ok(DashboardSummary {
        today_sales_minor,
        today_orders,
        stock_units,
        low_stock_count,
        recent_sales,
        daily_sales,
    })
}

pub fn list_sales(connection: &Connection) -> Result<Vec<SaleSummary>, rusqlite::Error> {
    let mut statement = connection.prepare(
        "SELECT sales.id, sales.invoice_number,
                customers.name, sales.sold_at,
                sales.total_minor, sales.status
         FROM sales
         LEFT JOIN customers ON customers.id = sales.customer_id
         ORDER BY sales.sold_at DESC",
    )?;
    let sales = statement
        .query_map([], |row| {
            Ok(SaleSummary {
                id: row.get(0)?,
                invoice_number: row.get(1)?,
                customer_name: row.get(2)?,
                sold_at: row.get(3)?,
                total_minor: row.get(4)?,
                status: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(sales)
}

pub fn list_customers(connection: &Connection) -> Result<Vec<CustomerSummary>, rusqlite::Error> {
    let mut statement = connection
        .prepare("SELECT id, name, phone FROM customers WHERE is_enabled = 1 ORDER BY name")?;
    let customers = statement
        .query_map([], |row| {
            Ok(CustomerSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                phone: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(customers)
}

pub fn create_customer(
    connection: &Connection,
    name: &str,
    phone: Option<&str>,
) -> Result<i64, String> {
    if name.trim().is_empty() {
        return Err("Customer name must not be empty".to_owned());
    }
    connection
        .execute(
            "INSERT INTO customers (name, phone) VALUES (?1, ?2)",
            params![
                name.trim(),
                phone.map(str::trim).filter(|value| !value.is_empty())
            ],
        )
        .map(|_| connection.last_insert_rowid())
        .map_err(|error| error.to_string())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleCartItem {
    pub product_id: i64,
    pub quantity: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedSale {
    pub invoice_number: String,
    pub total_minor: i64,
}

pub fn create_sale(
    connection: &mut Connection,
    customer_id: Option<i64>,
    items: &[SaleCartItem],
    status: &str,
) -> Result<CreatedSale, String> {
    if items.is_empty()
        || items
            .iter()
            .any(|item| item.product_id <= 0 || item.quantity <= 0)
        || !matches!(status, "paid" | "pending" | "cancelled")
    {
        return Err("Invalid sale details".to_owned());
    }
    let transaction: Transaction<'_> = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    let items = items
        .iter()
        .map(|item| {
            let unit_price_minor = transaction
                .query_row(
                    "SELECT sale_price_minor FROM products
                     WHERE id = ?1 AND is_enabled = 1",
                    [item.product_id],
                    |row| row.get::<_, i64>(0),
                )
                .map_err(|error| error.to_string())?;
            if unit_price_minor <= 0 {
                return Err("Product must have a sale price greater than zero".to_owned());
            }
            Ok((item.product_id, item.quantity, unit_price_minor))
        })
        .collect::<Result<Vec<_>, String>>()?;
    let business_date: String = transaction
        .query_row("SELECT date('now', 'localtime')", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    let next_sale_id: i64 = transaction
        .query_row("SELECT COALESCE(MAX(id), 0) + 1 FROM sales", [], |row| {
            row.get(0)
        })
        .map_err(|error| error.to_string())?;
    let invoice_number = format!("INV-{}-{next_sale_id:06}", business_date.replace('-', ""));
    if status == "paid" {
        for (product_id, quantity, _) in &items {
            crate::inventory::dispense_fefo_in_transaction(
                &transaction,
                *product_id,
                *quantity,
                &business_date,
                &invoice_number,
            )
            .map_err(|error| error.to_string())?;
        }
    }
    let total = items
        .iter()
        .try_fold(0_i64, |sum, (_, quantity, unit_price)| {
            quantity
                .checked_mul(*unit_price)
                .and_then(|line| sum.checked_add(line))
        })
        .ok_or_else(|| "Sale total overflow".to_owned())?;
    transaction
        .execute(
            "INSERT INTO sales (invoice_number, customer_id, subtotal_minor, total_minor, status)
         VALUES (?1, ?2, ?3, ?3, ?4)",
            params![invoice_number, customer_id, total, status],
        )
        .map_err(|error| error.to_string())?;
    let sale_id = transaction.last_insert_rowid();
    for (product_id, quantity, unit_price) in items {
        let line_total = quantity
            .checked_mul(unit_price)
            .ok_or_else(|| "Sale line total overflow".to_owned())?;
        transaction.execute(
            "INSERT INTO sale_items (sale_id, product_id, quantity, unit_price_minor, line_total_minor)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![sale_id, product_id, quantity, unit_price, line_total],
        ).map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(CreatedSale {
        invoice_number,
        total_minor: total,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseSummary {
    pub id: i64,
    pub reference_number: String,
    pub supplier_name: String,
    pub total_minor: i64,
    pub status: String,
    pub purchased_at: String,
}

pub fn list_purchases(connection: &Connection) -> Result<Vec<PurchaseSummary>, rusqlite::Error> {
    let mut statement = connection.prepare(
        "SELECT id, reference_number, supplier_name, total_minor, status, purchased_at
         FROM purchases ORDER BY purchased_at DESC",
    )?;
    let purchases = statement
        .query_map([], |row| {
            Ok(PurchaseSummary {
                id: row.get(0)?,
                reference_number: row.get(1)?,
                supplier_name: row.get(2)?,
                total_minor: row.get(3)?,
                status: row.get(4)?,
                purchased_at: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(purchases)
}

pub fn create_purchase(
    connection: &mut Connection,
    reference_number: &str,
    supplier_name: &str,
    product_id: i64,
    batch_number: &str,
    expiry_date: &str,
    quantity: i64,
    unit_cost_minor: i64,
) -> Result<i64, String> {
    if reference_number.trim().is_empty()
        || supplier_name.trim().is_empty()
        || batch_number.trim().is_empty()
        || product_id <= 0
        || quantity <= 0
        || unit_cost_minor < 0
    {
        return Err("Invalid purchase details".to_owned());
    }
    let total_minor = quantity
        .checked_mul(unit_cost_minor)
        .ok_or_else(|| "Purchase total overflow".to_owned())?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO purchases (reference_number, supplier_name, total_minor, status)
         VALUES (?1, ?2, ?3, 'received')",
            params![reference_number.trim(), supplier_name.trim(), total_minor],
        )
        .map_err(|error| error.to_string())?;
    let id = transaction.last_insert_rowid();
    transaction
        .execute(
            "INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost_minor)
         VALUES (?1, ?2, ?3, ?4)",
            params![id, product_id, quantity, unit_cost_minor],
        )
        .map_err(|error| error.to_string())?;
    crate::inventory::receive_batch_in_transaction(
        &transaction,
        product_id,
        batch_number,
        expiry_date,
        quantity,
        &format!("purchase-{}", reference_number.trim()),
    )
    .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(id)
}

pub fn get_setting(connection: &Connection, key: &str) -> Result<String, rusqlite::Error> {
    connection
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            [key],
            |row| row.get(0),
        )
        .or_else(|error| {
            if matches!(error, rusqlite::Error::QueryReturnedNoRows) {
                Ok(String::new())
            } else {
                Err(error)
            }
        })
}

pub fn set_setting(connection: &Connection, key: &str, value: &str) -> Result<(), rusqlite::Error> {
    connection.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        params![key, value],
    )?;
    Ok(())
}

pub fn set_settings(
    connection: &mut Connection,
    settings: &std::collections::HashMap<String, String>,
) -> Result<(), rusqlite::Error> {
    let transaction = connection.transaction()?;
    for (key, value) in settings {
        if key.trim().is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "setting key must not be empty".to_owned(),
            ));
        }
        transaction.execute(
            "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
            params![key, value],
        )?;
    }
    transaction.commit()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{database, inventory};

    fn setup() -> (tempfile::TempDir, Connection, i64) {
        let directory = tempfile::tempdir().expect("create temporary directory");
        let connection = database::initialize(directory.path()).expect("initialize database");
        let product_id = inventory::create_product(
            &connection,
            "TEST-001",
            None,
            "دواء تجريبي",
            "Test medicine",
            "tablet",
            2,
            250,
        )
        .expect("create product");
        (directory, connection, product_id)
    }

    #[test]
    fn saves_pharmacy_settings_as_a_single_persistent_update() {
        let (_directory, mut connection, _) = setup();
        let settings = std::collections::HashMap::from([
            ("pharmacy_name".to_owned(), "Dawai".to_owned()),
            ("pharmacy_address".to_owned(), "Main Street".to_owned()),
        ]);
        set_settings(&mut connection, &settings).expect("save pharmacy settings");

        assert_eq!(
            get_setting(&connection, "pharmacy_name").expect("read pharmacy name"),
            "Dawai"
        );
        assert_eq!(
            get_setting(&connection, "pharmacy_address").expect("read pharmacy address"),
            "Main Street"
        );
    }

    #[test]
    fn purchase_receipt_and_stock_are_committed_together() {
        let (_directory, mut connection, product_id) = setup();
        let purchase_id = create_purchase(
            &mut connection,
            "PO-001",
            "Supplier",
            product_id,
            "LOT-001",
            "2999-12-31",
            12,
            125,
        )
        .expect("record purchase");

        assert_eq!(
            list_purchases(&connection).expect("list purchases")[0].total_minor,
            1500
        );
        assert_eq!(
            inventory::list_products(&connection).expect("list products")[0].available_units,
            12
        );
        let item_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM purchase_items WHERE purchase_id = ?1",
                [purchase_id],
                |row| row.get(0),
            )
            .expect("read purchase item");
        assert_eq!(item_count, 1);
    }

    #[test]
    fn invalid_purchase_does_not_leave_a_purchase_or_stock_movement() {
        let (_directory, mut connection, product_id) = setup();
        assert!(create_purchase(
            &mut connection,
            "PO-BAD",
            "Supplier",
            product_id,
            "LOT-BAD",
            "not-a-date",
            10,
            100,
        )
        .is_err());
        assert!(list_purchases(&connection)
            .expect("list purchases")
            .is_empty());
        assert_eq!(
            inventory::list_products(&connection).expect("list products")[0].available_units,
            0
        );
    }

    #[test]
    fn paid_sale_uses_fefo_and_insufficient_stock_rolls_back() {
        let (_directory, mut connection, product_id) = setup();
        inventory::receive_batch(
            &mut connection,
            product_id,
            "LOT-SALE",
            "2999-12-31",
            3,
            "initial-stock",
        )
        .expect("receive stock");

        assert!(create_sale(
            &mut connection,
            None,
            &[SaleCartItem {
                product_id,
                quantity: 4,
            }],
            "paid",
        )
        .is_err());
        assert!(list_sales(&connection).expect("list sales").is_empty());
        assert_eq!(
            inventory::list_products(&connection).expect("list products")[0].available_units,
            3
        );

        let created_sale = create_sale(
            &mut connection,
            None,
            &[SaleCartItem {
                product_id,
                quantity: 2,
            }],
            "paid",
        )
        .expect("record sale");
        assert!(created_sale.invoice_number.starts_with("INV-"));
        assert_eq!(created_sale.total_minor, 500);
        assert_eq!(
            list_sales(&connection).expect("list sales")[0].total_minor,
            500
        );
        assert_eq!(
            inventory::list_products(&connection).expect("list products")[0].available_units,
            1
        );
        let dashboard = dashboard(&connection).expect("read dashboard");
        assert_eq!(dashboard.today_sales_minor, 500);
        assert_eq!(dashboard.today_orders, 1);
        assert_eq!(dashboard.stock_units, 1);
    }
}
