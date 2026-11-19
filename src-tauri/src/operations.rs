use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
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
    pub currency_code: String,
    pub exchange_rate_scaled: i64,
    pub payment_method: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrencySummary {
    pub code: String,
    pub name: String,
    pub symbol: String,
    pub minor_unit_exponent: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SalePaymentInput {
    pub method: String,
    pub amount_minor: i64,
    pub currency_code: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SalePaymentSummary {
    pub method: String,
    pub amount_minor: i64,
    pub currency_code: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleItemDetail {
    pub product_name_ar: String,
    pub product_name_en: String,
    pub quantity: i64,
    pub unit_price_minor: i64,
    pub discount_minor: i64,
    pub line_total_minor: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleDetail {
    pub id: i64,
    pub invoice_number: String,
    pub customer_name: Option<String>,
    pub sold_at: String,
    pub subtotal_minor: i64,
    pub discount_minor: i64,
    pub tax_minor: i64,
    pub total_minor: i64,
    pub status: String,
    pub currency_code: String,
    pub exchange_rate_scaled: i64,
    pub tax_rate_basis_points: i64,
    pub items: Vec<SaleItemDetail>,
    pub payments: Vec<SalePaymentSummary>,
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
                sales.total_minor, sales.status, sales.currency_code, sales.exchange_rate_scaled,
                CASE WHEN COUNT(DISTINCT sale_payments.method) > 1 THEN 'mixed'
                     ELSE MIN(sale_payments.method) END
         FROM sales
         LEFT JOIN customers ON customers.id = sales.customer_id
         LEFT JOIN sale_payments ON sale_payments.sale_id = sales.id
         GROUP BY sales.id
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
                currency_code: row.get(6)?,
                exchange_rate_scaled: row.get(7)?,
                payment_method: row.get(8)?,
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
                sales.total_minor, sales.status, sales.currency_code, sales.exchange_rate_scaled,
                CASE WHEN COUNT(DISTINCT sale_payments.method) > 1 THEN 'mixed'
                     ELSE MIN(sale_payments.method) END
         FROM sales
         LEFT JOIN customers ON customers.id = sales.customer_id
         LEFT JOIN sale_payments ON sale_payments.sale_id = sales.id
         GROUP BY sales.id
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
                currency_code: row.get(6)?,
                exchange_rate_scaled: row.get(7)?,
                payment_method: row.get(8)?,
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
    #[serde(default)]
    pub discount_basis_points: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedSale {
    pub id: i64,
    pub invoice_number: String,
    pub total_minor: i64,
}

pub fn create_sale(
    connection: &mut Connection,
    customer_id: Option<i64>,
    items: &[SaleCartItem],
    status: &str,
    payments: &[SalePaymentInput],
    currency_code: &str,
    exchange_rate_scaled: i64,
) -> Result<CreatedSale, String> {
    if items.is_empty()
        || items.iter().any(|item| {
            item.product_id <= 0
                || item.quantity <= 0
                || !(0..=10000).contains(&item.discount_basis_points)
        })
        || status != "paid"
        || payments.is_empty()
        || payments.iter().any(|payment| {
            !matches!(payment.method.as_str(), "cash" | "card" | "bank_transfer")
                || payment.amount_minor <= 0
                || payment.currency_code != currency_code
        })
        || exchange_rate_scaled <= 0
    {
        return Err("Invalid sale details".to_owned());
    }
    let transaction: Transaction<'_> = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    let (currency_enabled, base_exponent, invoice_exponent): (bool, i64, i64) = transaction
        .query_row(
            "SELECT invoice_currency.is_enabled,
                    base_currency.minor_unit_exponent,
                    invoice_currency.minor_unit_exponent
             FROM currencies AS invoice_currency
             JOIN currencies AS base_currency ON base_currency.code = 'SAR'
             WHERE invoice_currency.code = ?1",
            [currency_code],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|error| error.to_string())?;
    if !currency_enabled {
        return Err("Selected currency is disabled".to_owned());
    }
    let configured_tax_rate: Option<String> = transaction
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'tax_rate_basis_points'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let tax_rate_basis_points = configured_tax_rate
        .map(|value| {
            value
                .parse::<i64>()
                .map_err(|_| "Invalid configured tax rate".to_owned())
        })
        .transpose()?
        .unwrap_or(0);
    if !(0..=10000).contains(&tax_rate_basis_points) {
        return Err("Invalid configured tax rate".to_owned());
    }
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
            let line_subtotal = item
                .quantity
                .checked_mul(unit_price_minor)
                .ok_or_else(|| "Sale line total overflow".to_owned())?;
            let line_discount = rounded_ratio(line_subtotal, item.discount_basis_points, 10000)?;
            let line_total = line_subtotal
                .checked_sub(line_discount)
                .ok_or_else(|| "Sale discount exceeds line total".to_owned())?;
            Ok((
                item.product_id,
                item.quantity,
                unit_price_minor,
                line_discount,
                line_subtotal,
                line_total,
            ))
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
        for (product_id, quantity, _, _, _, _) in &items {
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
    let subtotal = items
        .iter()
        .try_fold(0_i64, |sum, (_, _, _, _, line_subtotal, _)| {
            sum.checked_add(*line_subtotal)
        })
        .ok_or_else(|| "Sale total overflow".to_owned())?;
    let discount = items
        .iter()
        .try_fold(0_i64, |sum, (_, _, _, line_discount, _, _)| {
            sum.checked_add(*line_discount)
        })
        .ok_or_else(|| "Sale discount overflow".to_owned())?;
    let taxable_subtotal = subtotal
        .checked_sub(discount)
        .ok_or_else(|| "Sale discount exceeds subtotal".to_owned())?;
    let tax = rounded_ratio(taxable_subtotal, tax_rate_basis_points, 10000)?;
    let total = taxable_subtotal
        .checked_add(tax)
        .ok_or_else(|| "Sale total overflow".to_owned())?;
    let invoice_total =
        convert_minor_units(total, base_exponent, invoice_exponent, exchange_rate_scaled)?;
    let paid = payments
        .iter()
        .try_fold(0_i64, |sum, payment| sum.checked_add(payment.amount_minor))
        .ok_or_else(|| "Payment total overflow".to_owned())?;
    if paid < invoice_total {
        return Err("Payment is less than the invoice total".to_owned());
    }
    transaction
        .execute(
            "INSERT INTO sales
             (invoice_number, customer_id, subtotal_minor, discount_minor, tax_minor, total_minor,
              status, currency_code, exchange_rate_scaled, tax_rate_basis_points)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                invoice_number,
                customer_id,
                subtotal,
                discount,
                tax,
                total,
                status,
                currency_code,
                exchange_rate_scaled,
                tax_rate_basis_points
            ],
        )
        .map_err(|error| error.to_string())?;
    let sale_id = transaction.last_insert_rowid();
    for (product_id, quantity, unit_price, line_discount, _, line_total) in items {
        transaction
            .execute(
                "INSERT INTO sale_items
             (sale_id, product_id, quantity, unit_price_minor, line_total_minor, discount_minor)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    sale_id,
                    product_id,
                    quantity,
                    unit_price,
                    line_total,
                    line_discount
                ],
            )
            .map_err(|error| error.to_string())?;
    }
    for payment in payments {
        transaction
            .execute(
                "INSERT INTO sale_payments (sale_id, method, amount_minor, currency_code)
             VALUES (?1, ?2, ?3, ?4)",
                params![
                    sale_id,
                    payment.method,
                    payment.amount_minor,
                    payment.currency_code
                ],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(CreatedSale {
        id: sale_id,
        invoice_number,
        total_minor: total,
    })
}

fn rounded_ratio(value: i64, numerator: i64, denominator: i64) -> Result<i64, String> {
    let result = (i128::from(value) * i128::from(numerator) + i128::from(denominator / 2))
        / i128::from(denominator);
    i64::try_from(result).map_err(|_| "Sale amount overflow".to_owned())
}

fn convert_minor_units(
    amount_minor: i64,
    base_exponent: i64,
    quote_exponent: i64,
    rate_scaled: i64,
) -> Result<i64, String> {
    let scale = 1_000_000_000_i128;
    let numerator = i128::from(amount_minor)
        .checked_mul(10_i128.pow(quote_exponent as u32))
        .and_then(|value| value.checked_mul(scale))
        .ok_or_else(|| "Currency conversion overflow".to_owned())?;
    let denominator = 10_i128
        .pow(base_exponent as u32)
        .checked_mul(i128::from(rate_scaled))
        .ok_or_else(|| "Currency conversion overflow".to_owned())?;
    let converted = (numerator + denominator / 2) / denominator;
    i64::try_from(converted).map_err(|_| "Currency conversion overflow".to_owned())
}

pub fn list_currencies(connection: &Connection) -> Result<Vec<CurrencySummary>, rusqlite::Error> {
    let mut statement = connection.prepare(
        "SELECT code, name, symbol, minor_unit_exponent
         FROM currencies WHERE is_enabled = 1 ORDER BY code",
    )?;
    let currencies = statement
        .query_map([], |row| {
            Ok(CurrencySummary {
                code: row.get(0)?,
                name: row.get(1)?,
                symbol: row.get(2)?,
                minor_unit_exponent: row.get(3)?,
            })
        })?
        .collect();
    currencies
}

pub fn get_sale(connection: &Connection, sale_id: i64) -> Result<SaleDetail, String> {
    let mut detail = connection
        .query_row(
            "SELECT sales.id, sales.invoice_number, customers.name, sales.sold_at,
                    sales.subtotal_minor, sales.discount_minor, sales.tax_minor, sales.total_minor,
                    sales.status, sales.currency_code, sales.exchange_rate_scaled,
                    sales.tax_rate_basis_points
             FROM sales LEFT JOIN customers ON customers.id = sales.customer_id
             WHERE sales.id = ?1",
            [sale_id],
            |row| {
                Ok(SaleDetail {
                    id: row.get(0)?,
                    invoice_number: row.get(1)?,
                    customer_name: row.get(2)?,
                    sold_at: row.get(3)?,
                    subtotal_minor: row.get(4)?,
                    discount_minor: row.get(5)?,
                    tax_minor: row.get(6)?,
                    total_minor: row.get(7)?,
                    status: row.get(8)?,
                    currency_code: row.get(9)?,
                    exchange_rate_scaled: row.get(10)?,
                    tax_rate_basis_points: row.get(11)?,
                    items: Vec::new(),
                    payments: Vec::new(),
                })
            },
        )
        .map_err(|error| error.to_string())?;

    let mut items = connection
        .prepare(
            "SELECT products.name_ar, products.name_en,
                    sale_items.quantity, sale_items.unit_price_minor,
                    sale_items.discount_minor, sale_items.line_total_minor
             FROM sale_items JOIN products ON products.id = sale_items.product_id
             WHERE sale_items.sale_id = ?1 ORDER BY sale_items.id",
        )
        .map_err(|error| error.to_string())?;
    detail.items = items
        .query_map([sale_id], |row| {
            Ok(SaleItemDetail {
                product_name_ar: row.get(0)?,
                product_name_en: row.get(1)?,
                quantity: row.get(2)?,
                unit_price_minor: row.get(3)?,
                discount_minor: row.get(4)?,
                line_total_minor: row.get(5)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    let mut payments = connection
        .prepare(
            "SELECT method, amount_minor, currency_code
             FROM sale_payments WHERE sale_id = ?1 ORDER BY id",
        )
        .map_err(|error| error.to_string())?;
    detail.payments = payments
        .query_map([sale_id], |row| {
            Ok(SalePaymentSummary {
                method: row.get(0)?,
                amount_minor: row.get(1)?,
                currency_code: row.get(2)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(detail)
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
                discount_basis_points: 0,
            }],
            "paid",
            &[SalePaymentInput {
                method: "cash".to_owned(),
                amount_minor: 1000,
                currency_code: "SAR".to_owned(),
            }],
            "SAR",
            1_000_000_000,
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
                discount_basis_points: 0,
            }],
            "paid",
            &[SalePaymentInput {
                method: "cash".to_owned(),
                amount_minor: 1000,
                currency_code: "SAR".to_owned(),
            }],
            "SAR",
            1_000_000_000,
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

    #[test]
    fn discounted_taxed_mixed_currency_sale_persists_payments_and_fefo_together() {
        let (_directory, mut connection, product_id) = setup();
        inventory::receive_batch(
            &mut connection,
            product_id,
            "LOT-MIXED",
            "2999-12-31",
            2,
            "initial-stock",
        )
        .expect("receive stock");
        set_setting(&connection, "tax_rate_basis_points", "1500").expect("configure VAT rate");

        let created_sale = create_sale(
            &mut connection,
            None,
            &[SaleCartItem {
                product_id,
                quantity: 2,
                discount_basis_points: 1000,
            }],
            "paid",
            &[
                SalePaymentInput {
                    method: "cash".to_owned(),
                    amount_minor: 1295,
                    currency_code: "BHD".to_owned(),
                },
                SalePaymentInput {
                    method: "card".to_owned(),
                    amount_minor: 1295,
                    currency_code: "BHD".to_owned(),
                },
            ],
            "BHD",
            2_000_000_000,
        )
        .expect("record mixed currency sale");

        assert_eq!(created_sale.total_minor, 518);
        assert_eq!(
            inventory::list_products(&connection).expect("list products")[0].available_units,
            0
        );
        let detail = get_sale(&connection, created_sale.id).expect("load invoice detail");
        assert_eq!(detail.currency_code, "BHD");
        assert_eq!(detail.exchange_rate_scaled, 2_000_000_000);
        assert_eq!(detail.tax_rate_basis_points, 1500);
        assert_eq!(detail.subtotal_minor, 500);
        assert_eq!(detail.discount_minor, 50);
        assert_eq!(detail.tax_minor, 68);
        assert_eq!(detail.items[0].discount_minor, 50);
        assert_eq!(detail.payments.len(), 2);
        assert_eq!(
            list_sales(&connection).expect("list sales")[0]
                .payment_method
                .as_deref(),
            Some("mixed")
        );
    }

    #[test]
    fn underpayment_rolls_back_sale_and_inventory_changes() {
        let (_directory, mut connection, product_id) = setup();
        inventory::receive_batch(
            &mut connection,
            product_id,
            "LOT-UNDERPAID",
            "2999-12-31",
            2,
            "initial-stock",
        )
        .expect("receive stock");

        assert!(create_sale(
            &mut connection,
            None,
            &[SaleCartItem {
                product_id,
                quantity: 2,
                discount_basis_points: 0,
            }],
            "paid",
            &[SalePaymentInput {
                method: "cash".to_owned(),
                amount_minor: 499,
                currency_code: "SAR".to_owned(),
            }],
            "SAR",
            1_000_000_000,
        )
        .is_err());
        assert!(list_sales(&connection).expect("list sales").is_empty());
        assert_eq!(
            inventory::list_products(&connection).expect("list products")[0].available_units,
            2
        );
    }
}
