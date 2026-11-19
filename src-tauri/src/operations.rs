use rusqlite::{params, Connection, Transaction, TransactionBehavior};
use serde::Serialize;

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
    pub customer_name: String,
    pub sold_at: String,
    pub total_minor: i64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSummary {
    pub today_sales_minor: i64,
    pub today_orders: i64,
    pub product_count: i64,
    pub low_stock_count: i64,
    pub recent_sales: Vec<SaleSummary>,
    pub daily_sales_minor: Vec<i64>,
}

pub fn dashboard(connection: &Connection) -> Result<DashboardSummary, rusqlite::Error> {
    let today_sales_minor = connection.query_row(
        "SELECT COALESCE(SUM(total_minor), 0) FROM sales
         WHERE sold_at >= strftime('%Y-%m-%dT00:00:00.000Z', 'now')
           AND status = 'paid'",
        [], |row| row.get(0),
    )?;
    let today_orders = connection.query_row(
        "SELECT COUNT(*) FROM sales
         WHERE sold_at >= strftime('%Y-%m-%dT00:00:00.000Z', 'now')",
        [], |row| row.get(0),
    )?;
    let product_count = connection.query_row(
        "SELECT COUNT(*) FROM products WHERE is_enabled = 1",
        [], |row| row.get(0),
    )?;
    let low_stock_count = connection.query_row(
        "SELECT COUNT(*) FROM (
            SELECT products.id
            FROM products
            LEFT JOIN batches ON batches.product_id = products.id
            LEFT JOIN stock_movements ON stock_movements.batch_id = batches.id
            WHERE products.is_enabled = 1
            GROUP BY products.id
            HAVING COALESCE(SUM(stock_movements.delta_units), 0) <= products.reorder_level_units
         )",
        [], |row| row.get(0),
    )?;

    let mut statement = connection.prepare(
        "SELECT sales.id, sales.invoice_number,
                COALESCE(customers.name, 'عميل نقدي'), sales.sold_at,
                sales.total_minor, sales.status
         FROM sales
         LEFT JOIN customers ON customers.id = sales.customer_id
         ORDER BY sales.sold_at DESC
         LIMIT 8",
    )?;
    let recent_sales = statement.query_map([], |row| {
        Ok(SaleSummary {
            id: row.get(0)?,
            invoice_number: row.get(1)?,
            customer_name: row.get(2)?,
            sold_at: row.get(3)?,
            total_minor: row.get(4)?,
            status: row.get(5)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    let daily_sales_minor = (0_i64..7)
        .map(|offset| {
            let date: String = connection.query_row(
                "SELECT strftime('%Y-%m-%d', 'now', ?1)",
                [format!("-{offset} days")],
                |row| row.get(0),
            )?;
            connection.query_row(
                "SELECT COALESCE(SUM(total_minor), 0) FROM sales
                 WHERE substr(sold_at, 1, 10) = ?1 AND status = 'paid'",
                [&date],
                |row| row.get(0),
            )
        })
        .collect::<Result<Vec<_>, rusqlite::Error>>()?
        .into_iter().rev().collect();

    Ok(DashboardSummary {
        today_sales_minor,
        today_orders,
        product_count,
        low_stock_count,
        recent_sales,
        daily_sales_minor,
    })
}

pub fn list_customers(connection: &Connection) -> Result<Vec<CustomerSummary>, rusqlite::Error> {
    let mut statement = connection.prepare(
        "SELECT id, name, phone FROM customers WHERE is_enabled = 1 ORDER BY name",
    )?;
    let customers = statement.query_map([], |row| {
        Ok(CustomerSummary { id: row.get(0)?, name: row.get(1)?, phone: row.get(2)? })
    })?.collect::<Result<Vec<_>, _>>()?;
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
    connection.execute(
        "INSERT INTO customers (name, phone) VALUES (?1, ?2)",
        params![name.trim(), phone.map(str::trim)],
    ).map(|_| connection.last_insert_rowid()).map_err(|error| error.to_string())
}

pub fn create_sale(
    connection: &mut Connection,
    invoice_number: &str,
    customer_id: Option<i64>,
    items: &[(i64, i64, i64)],
    status: &str,
) -> Result<i64, String> {
    if invoice_number.trim().is_empty() || items.is_empty()
        || !matches!(status, "paid" | "pending" | "cancelled")
    {
        return Err("Invalid sale details".to_owned());
    }
    let transaction: Transaction<'_> = connection.transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    if status == "paid" {
        for (product_id, quantity, _) in items {
            crate::inventory::dispense_fefo_in_transaction(
                &transaction,
                *product_id,
                *quantity,
                &transaction.query_row("SELECT date('now', 'localtime')", [], |row| row.get::<_, String>(0))
                    .map_err(|error| error.to_string())?,
                invoice_number,
            ).map_err(|error| error.to_string())?;
        }
    }
    let total = items.iter().try_fold(0_i64, |sum, (_, quantity, unit_price)| {
        quantity.checked_mul(*unit_price).and_then(|line| sum.checked_add(line))
    }).ok_or_else(|| "Sale total overflow".to_owned())?;
    transaction.execute(
        "INSERT INTO sales (invoice_number, customer_id, subtotal_minor, total_minor, status)
         VALUES (?1, ?2, ?3, ?3, ?4)",
        params![invoice_number.trim(), customer_id, total, status],
    ).map_err(|error| error.to_string())?;
    let sale_id = transaction.last_insert_rowid();
    for (product_id, quantity, unit_price) in items {
        transaction.execute(
            "INSERT INTO sale_items (sale_id, product_id, quantity, unit_price_minor, line_total_minor)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![sale_id, product_id, quantity, unit_price, quantity.checked_mul(*unit_price).unwrap_or(0)],
        ).map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(sale_id)
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
    let purchases = statement.query_map([], |row| {
        Ok(PurchaseSummary {
            id: row.get(0)?,
            reference_number: row.get(1)?,
            supplier_name: row.get(2)?,
            total_minor: row.get(3)?,
            status: row.get(4)?,
            purchased_at: row.get(5)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(purchases)
}

pub fn create_purchase(
    connection: &mut Connection,
    reference_number: &str,
    supplier_name: &str,
    total_minor: i64,
) -> Result<i64, String> {
    if reference_number.trim().is_empty() || supplier_name.trim().is_empty() || total_minor < 0 {
        return Err("Invalid purchase details".to_owned());
    }
    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    transaction.execute(
        "INSERT INTO purchases (reference_number, supplier_name, total_minor, status)
         VALUES (?1, ?2, ?3, 'received')",
        params![reference_number.trim(), supplier_name.trim(), total_minor],
    ).map_err(|error| error.to_string())?;
    let id = transaction.last_insert_rowid();
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(id)
}

pub fn get_setting(connection: &Connection, key: &str) -> Result<String, rusqlite::Error> {
    connection.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        [key],
        |row| row.get(0),
    )
    .or_else(|error| if matches!(error, rusqlite::Error::QueryReturnedNoRows) {
        Ok(String::new())
    } else {
        Err(error)
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
