use std::collections::HashMap;

use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum InventoryError {
    #[error("SQLite operation failed: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("product fields must not be empty and reorder level must be non-negative")]
    InvalidProduct,
    #[error("product id must be positive")]
    InvalidProductId,
    #[error("disabled products cannot receive or dispense stock")]
    ProductDisabled,
    #[error("batch number and source reference must not be empty")]
    InvalidReference,
    #[error("quantity must be a positive whole number of the product's base unit")]
    InvalidQuantity,
    #[error("expiry date must be a valid YYYY-MM-DD date")]
    InvalidDate,
    #[error(
        "insufficient unexpired stock: requested {requested_units}, available {available_units}"
    )]
    InsufficientStock {
        requested_units: i64,
        available_units: i64,
    },
    #[error("stock quantity overflow")]
    QuantityOverflow,
    #[error("invalid product category")]
    InvalidCategory,
    #[error("invalid sale unit")]
    InvalidSaleUnit,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchAllocation {
    pub batch_id: i64,
    pub batch_number: String,
    pub expiry_date: String,
    pub units: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchBalance {
    pub batch_id: i64,
    pub batch_number: String,
    pub expiry_date: String,
    pub available_units: i64,
    pub is_expired: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductSummary {
    pub id: i64,
    pub sku: String,
    pub barcode: Option<String>,
    pub name_ar: String,
    pub name_en: String,
    pub base_unit: String,
    pub category: String,
    pub reorder_level_units: i64,
    pub sale_price_minor: i64,
    pub available_units: i64,
    pub nearest_expiry_date: Option<String>,
    pub sale_units: Vec<ProductSaleUnitSummary>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductSaleUnitSummary {
    pub id: i64,
    pub name: String,
    pub base_units_per_unit: i64,
    pub sale_price_minor: i64,
    pub is_base_unit: bool,
}

#[derive(Debug)]
struct AvailableBatch {
    batch_id: i64,
    batch_number: String,
    expiry_date: String,
    available_units: i64,
}

pub fn create_product(
    connection: &Connection,
    sku: &str,
    barcode: Option<&str>,
    name_ar: &str,
    name_en: &str,
    base_unit: &str,
    reorder_level_units: i64,
    sale_price_minor: i64,
) -> Result<i64, InventoryError> {
    create_product_with_category(
        connection,
        sku,
        barcode,
        name_ar,
        name_en,
        base_unit,
        reorder_level_units,
        sale_price_minor,
        None,
    )
}

pub fn create_product_with_category(
    connection: &Connection,
    sku: &str,
    barcode: Option<&str>,
    name_ar: &str,
    name_en: &str,
    base_unit: &str,
    reorder_level_units: i64,
    sale_price_minor: i64,
    category: Option<&str>,
) -> Result<i64, InventoryError> {
    if [sku, name_ar, name_en, base_unit]
        .iter()
        .any(|value| value.trim().is_empty())
        || barcode.is_some_and(|value| value.trim().is_empty())
        || reorder_level_units < 0
        || sale_price_minor < 0
        || category.is_some_and(|value| value.chars().count() > 100)
    {
        return Err(
            if category.is_some_and(|value| value.chars().count() > 100) {
                InventoryError::InvalidCategory
            } else {
                InventoryError::InvalidProduct
            },
        );
    }

    let transaction = connection.unchecked_transaction()?;
    transaction.execute(
        "INSERT INTO products
         (sku, barcode, name_ar, name_en, base_unit, reorder_level_units, sale_price_minor, category)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            sku.trim(),
            barcode.map(str::trim),
            name_ar.trim(),
            name_en.trim(),
            base_unit.trim(),
            reorder_level_units,
            sale_price_minor,
            category.map(str::trim).unwrap_or_default()
        ],
    )?;
    let product_id = transaction.last_insert_rowid();
    transaction.execute(
        "INSERT INTO product_sale_units
         (product_id, name, base_units_per_unit, sale_price_minor, is_base_unit)
         VALUES (?1, ?2, 1, ?3, 1)",
        params![product_id, base_unit.trim(), sale_price_minor],
    )?;
    transaction.commit()?;
    Ok(product_id)
}

pub fn update_product_sale_price(
    connection: &Connection,
    product_id: i64,
    sale_price_minor: i64,
) -> Result<(), InventoryError> {
    if product_id <= 0 || sale_price_minor < 0 {
        return Err(InventoryError::InvalidProduct);
    }
    let transaction = connection.unchecked_transaction()?;
    let updated = transaction.execute(
        "UPDATE products SET sale_price_minor = ?1,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?2 AND is_enabled = 1",
        params![sale_price_minor, product_id],
    )?;
    if updated == 0 {
        return Err(InventoryError::InvalidProductId);
    }
    transaction.execute(
        "UPDATE product_sale_units SET sale_price_minor = ?1
         WHERE product_id = ?2 AND is_base_unit = 1",
        params![sale_price_minor, product_id],
    )?;
    transaction.commit()?;
    Ok(())
}

pub fn update_product_category(
    connection: &Connection,
    product_id: i64,
    category: &str,
) -> Result<(), InventoryError> {
    if product_id <= 0 {
        return Err(InventoryError::InvalidProductId);
    }
    if category.chars().count() > 100 {
        return Err(InventoryError::InvalidCategory);
    }
    let updated = connection.execute(
        "UPDATE products SET category = ?1,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?2 AND is_enabled = 1",
        params![category.trim(), product_id],
    )?;
    if updated == 0 {
        return Err(InventoryError::InvalidProductId);
    }
    Ok(())
}

pub fn save_product_sale_unit(
    connection: &Connection,
    product_id: i64,
    sale_unit_id: Option<i64>,
    name: &str,
    base_units_per_unit: i64,
    sale_price_minor: i64,
) -> Result<i64, InventoryError> {
    if product_id <= 0
        || name.trim().is_empty()
        || base_units_per_unit <= 0
        || sale_price_minor < 0
        || name.chars().count() > 40
    {
        return Err(InventoryError::InvalidSaleUnit);
    }

    let transaction = connection.unchecked_transaction()?;
    let product_enabled: bool = transaction
        .query_row(
            "SELECT is_enabled FROM products WHERE id = ?1",
            [product_id],
            |row| row.get(0),
        )
        .optional()?
        .ok_or(InventoryError::InvalidProductId)?;
    if !product_enabled {
        return Err(InventoryError::ProductDisabled);
    }

    let unit_id = if let Some(sale_unit_id) = sale_unit_id {
        let is_base_unit: bool = transaction
            .query_row(
                "SELECT is_base_unit FROM product_sale_units
                 WHERE id = ?1 AND product_id = ?2",
                params![sale_unit_id, product_id],
                |row| row.get(0),
            )
            .optional()?
            .ok_or(InventoryError::InvalidSaleUnit)?;
        if (is_base_unit && base_units_per_unit != 1) || (!is_base_unit && base_units_per_unit == 1)
        {
            return Err(InventoryError::InvalidSaleUnit);
        }
        transaction.execute(
            "UPDATE product_sale_units
             SET name = ?1, base_units_per_unit = ?2, sale_price_minor = ?3, is_enabled = 1
             WHERE id = ?4 AND product_id = ?5",
            params![
                name.trim(),
                base_units_per_unit,
                sale_price_minor,
                sale_unit_id,
                product_id
            ],
        )?;
        if is_base_unit {
            transaction.execute(
                "UPDATE products SET base_unit = ?1, sale_price_minor = ?2,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?3",
                params![name.trim(), sale_price_minor, product_id],
            )?;
        }
        sale_unit_id
    } else {
        if base_units_per_unit == 1 {
            return Err(InventoryError::InvalidSaleUnit);
        }
        transaction.execute(
            "INSERT INTO product_sale_units
             (product_id, name, base_units_per_unit, sale_price_minor)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                product_id,
                name.trim(),
                base_units_per_unit,
                sale_price_minor
            ],
        )?;
        transaction.last_insert_rowid()
    };
    transaction.commit()?;
    Ok(unit_id)
}

pub fn update_product_reorder_level(
    connection: &Connection,
    product_id: i64,
    reorder_level_units: i64,
) -> Result<(), InventoryError> {
    if product_id <= 0 || reorder_level_units < 0 {
        return Err(InventoryError::InvalidProduct);
    }
    let updated = connection.execute(
        "UPDATE products SET reorder_level_units = ?1,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?2 AND is_enabled = 1",
        params![reorder_level_units, product_id],
    )?;
    if updated == 0 {
        return Err(InventoryError::InvalidProductId);
    }
    Ok(())
}

pub fn receive_batch(
    connection: &mut Connection,
    product_id: i64,
    batch_number: &str,
    expiry_date: &str,
    units: i64,
    source_id: &str,
) -> Result<i64, InventoryError> {
    if product_id <= 0 {
        return Err(InventoryError::InvalidProductId);
    }
    if batch_number.trim().is_empty() || source_id.trim().is_empty() {
        return Err(InventoryError::InvalidReference);
    }
    if units <= 0 {
        return Err(InventoryError::InvalidQuantity);
    }
    if !is_valid_date(connection, expiry_date)? {
        return Err(InventoryError::InvalidDate);
    }

    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let batch_id = receive_batch_in_transaction(
        &transaction,
        product_id,
        batch_number,
        expiry_date,
        units,
        source_id,
    )?;
    transaction.commit()?;

    Ok(batch_id)
}

pub(crate) fn receive_batch_in_transaction(
    transaction: &Transaction<'_>,
    product_id: i64,
    batch_number: &str,
    expiry_date: &str,
    units: i64,
    source_id: &str,
) -> Result<i64, InventoryError> {
    if product_id <= 0 {
        return Err(InventoryError::InvalidProductId);
    }
    ensure_product_enabled(transaction, product_id)?;
    if batch_number.trim().is_empty() || source_id.trim().is_empty() {
        return Err(InventoryError::InvalidReference);
    }
    if units <= 0 {
        return Err(InventoryError::InvalidQuantity);
    }
    if !is_valid_date(transaction, expiry_date)? {
        return Err(InventoryError::InvalidDate);
    }

    transaction.execute(
        "INSERT INTO batches (product_id, batch_number, expiry_date)
         VALUES (?1, ?2, ?3)",
        params![product_id, batch_number.trim(), expiry_date],
    )?;
    let batch_id = transaction.last_insert_rowid();
    transaction.execute(
        "INSERT INTO stock_movements
         (batch_id, delta_units, movement_type, source_id)
         VALUES (?1, ?2, 'receipt', ?3)",
        params![batch_id, units, source_id.trim()],
    )?;
    Ok(batch_id)
}

pub fn dispense_fefo(
    connection: &mut Connection,
    product_id: i64,
    requested_units: i64,
    source_id: &str,
) -> Result<Vec<BatchAllocation>, InventoryError> {
    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let business_date: String =
        transaction.query_row("SELECT date('now', 'localtime')", [], |row| row.get(0))?;
    let allocations = dispense_fefo_in_transaction(
        &transaction,
        product_id,
        requested_units,
        &business_date,
        source_id,
    )?;
    transaction.commit()?;
    Ok(allocations)
}

#[cfg(test)]
fn dispense_fefo_on_date(
    connection: &mut Connection,
    product_id: i64,
    requested_units: i64,
    as_of_date: &str,
    source_id: &str,
) -> Result<Vec<BatchAllocation>, InventoryError> {
    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let allocations = dispense_fefo_in_transaction(
        &transaction,
        product_id,
        requested_units,
        as_of_date,
        source_id,
    )?;
    transaction.commit()?;
    Ok(allocations)
}

pub(crate) fn dispense_fefo_in_transaction(
    transaction: &Transaction<'_>,
    product_id: i64,
    requested_units: i64,
    as_of_date: &str,
    source_id: &str,
) -> Result<Vec<BatchAllocation>, InventoryError> {
    if product_id <= 0 {
        return Err(InventoryError::InvalidProductId);
    }
    ensure_product_enabled(transaction, product_id)?;
    if source_id.trim().is_empty() {
        return Err(InventoryError::InvalidReference);
    }
    if requested_units <= 0 {
        return Err(InventoryError::InvalidQuantity);
    }
    if !is_valid_date(transaction, as_of_date)? {
        return Err(InventoryError::InvalidDate);
    }

    let candidates = {
        let mut statement = transaction.prepare(
            "SELECT batches.id, batches.batch_number, batches.expiry_date,
                    COALESCE(SUM(stock_movements.delta_units), 0) AS available_units
             FROM batches
             LEFT JOIN stock_movements ON stock_movements.batch_id = batches.id
             WHERE batches.product_id = ?1 AND batches.expiry_date >= ?2
             GROUP BY batches.id
             HAVING available_units > 0
             ORDER BY batches.expiry_date ASC, batches.id ASC",
        )?;
        let rows = statement
            .query_map(params![product_id, as_of_date], |row| {
                Ok(AvailableBatch {
                    batch_id: row.get(0)?,
                    batch_number: row.get(1)?,
                    expiry_date: row.get(2)?,
                    available_units: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };

    let available_units = candidates.iter().try_fold(0_i64, |sum, batch| {
        sum.checked_add(batch.available_units)
            .ok_or(InventoryError::QuantityOverflow)
    })?;
    if available_units < requested_units {
        return Err(InventoryError::InsufficientStock {
            requested_units,
            available_units,
        });
    }

    let mut remaining_units = requested_units;
    let mut allocations = Vec::new();
    for batch in candidates {
        let units = remaining_units.min(batch.available_units);
        transaction.execute(
            "INSERT INTO stock_movements
             (batch_id, delta_units, movement_type, source_id)
             VALUES (?1, ?2, 'dispense', ?3)",
            params![batch.batch_id, -units, source_id.trim()],
        )?;
        allocations.push(BatchAllocation {
            batch_id: batch.batch_id,
            batch_number: batch.batch_number,
            expiry_date: batch.expiry_date,
            units,
        });
        remaining_units -= units;
        if remaining_units == 0 {
            break;
        }
    }
    Ok(allocations)
}

pub fn batch_balances(
    connection: &Connection,
    product_id: i64,
) -> Result<Vec<BatchBalance>, InventoryError> {
    if product_id <= 0 {
        return Err(InventoryError::InvalidProductId);
    }
    let mut statement = connection.prepare(
        "SELECT batches.id, batches.batch_number, batches.expiry_date,
                COALESCE(SUM(stock_movements.delta_units), 0) AS available_units,
                batches.expiry_date < date('now', 'localtime') AS is_expired
         FROM batches
         LEFT JOIN stock_movements ON stock_movements.batch_id = batches.id
         WHERE batches.product_id = ?1
         GROUP BY batches.id
         HAVING available_units > 0
         ORDER BY batches.expiry_date ASC, batches.id ASC",
    )?;
    let balances = statement
        .query_map([product_id], |row| {
            Ok(BatchBalance {
                batch_id: row.get(0)?,
                batch_number: row.get(1)?,
                expiry_date: row.get(2)?,
                available_units: row.get(3)?,
                is_expired: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(balances)
}

pub fn list_products(connection: &Connection) -> Result<Vec<ProductSummary>, InventoryError> {
    let mut statement = connection.prepare(
        "SELECT products.id, products.sku, products.barcode,
                products.name_ar, products.name_en, products.base_unit,
                products.category,
                products.reorder_level_units,
                products.sale_price_minor,
                COALESCE(SUM(stock_movements.delta_units), 0) AS available_units,
                (SELECT MIN(available_batches.expiry_date)
                 FROM batches AS available_batches
                 WHERE available_batches.product_id = products.id
                   AND available_batches.expiry_date >= date('now', 'localtime')
                   AND COALESCE(
                       (SELECT SUM(available_movements.delta_units)
                        FROM stock_movements AS available_movements
                        WHERE available_movements.batch_id = available_batches.id),
                       0
                   ) > 0) AS nearest_expiry_date
         FROM products
         LEFT JOIN batches ON batches.product_id = products.id
                            AND batches.expiry_date >= date('now', 'localtime')
         LEFT JOIN stock_movements ON stock_movements.batch_id = batches.id
         WHERE products.is_enabled = 1
         GROUP BY products.id
         ORDER BY products.name_ar COLLATE NOCASE ASC",
    )?;
    let mut products = statement
        .query_map([], |row| {
            Ok(ProductSummary {
                id: row.get(0)?,
                sku: row.get(1)?,
                barcode: row.get(2)?,
                name_ar: row.get(3)?,
                name_en: row.get(4)?,
                base_unit: row.get(5)?,
                category: row.get(6)?,
                reorder_level_units: row.get(7)?,
                sale_price_minor: row.get(8)?,
                available_units: row.get(9)?,
                nearest_expiry_date: row.get(10)?,
                sale_units: Vec::new(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut unit_statement = connection.prepare(
        "SELECT id, product_id, name, base_units_per_unit, sale_price_minor, is_base_unit
         FROM product_sale_units WHERE is_enabled = 1
         ORDER BY product_id, is_base_unit DESC, base_units_per_unit",
    )?;
    let mut units_by_product: HashMap<i64, Vec<ProductSaleUnitSummary>> = HashMap::new();
    for unit in unit_statement.query_map([], |row| {
        Ok((
            row.get::<_, i64>(1)?,
            ProductSaleUnitSummary {
                id: row.get(0)?,
                name: row.get(2)?,
                base_units_per_unit: row.get(3)?,
                sale_price_minor: row.get(4)?,
                is_base_unit: row.get(5)?,
            },
        ))
    })? {
        let (product_id, unit) = unit?;
        units_by_product.entry(product_id).or_default().push(unit);
    }
    for product in &mut products {
        product.sale_units = units_by_product.remove(&product.id).unwrap_or_default();
    }
    Ok(products)
}

fn is_valid_date(connection: &Connection, date: &str) -> Result<bool, rusqlite::Error> {
    connection.query_row("SELECT COALESCE(date(?1) = ?1, 0)", [date], |row| {
        row.get(0)
    })
}

fn ensure_product_enabled(connection: &Connection, product_id: i64) -> Result<(), InventoryError> {
    let enabled = connection
        .query_row(
            "SELECT is_enabled FROM products WHERE id = ?1",
            [product_id],
            |row| row.get::<_, bool>(0),
        )
        .optional()?
        .ok_or(InventoryError::InvalidProductId)?;
    if !enabled {
        return Err(InventoryError::ProductDisabled);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database;

    fn setup_inventory() -> (tempfile::TempDir, Connection, i64) {
        let directory = tempfile::tempdir().expect("create temporary data directory");
        let connection = database::initialize(directory.path()).expect("initialize test database");
        let product_id = create_product(
            &connection,
            "MED-001",
            Some("100001"),
            "باراسيتامول 500 ملغ",
            "Paracetamol 500 mg",
            "قرص",
            10,
            1250,
        )
        .expect("create product");
        (directory, connection, product_id)
    }

    #[test]
    fn updates_reorder_level_and_rejects_invalid_values() {
        let (_directory, connection, product_id) = setup_inventory();

        update_product_reorder_level(&connection, product_id, 25)
            .expect("update reorder threshold");
        let products = list_products(&connection).expect("list updated products");
        assert_eq!(products[0].reorder_level_units, 25);

        assert!(matches!(
            update_product_reorder_level(&connection, product_id, -1),
            Err(InventoryError::InvalidProduct)
        ));
        assert!(matches!(
            update_product_reorder_level(&connection, 0, 5),
            Err(InventoryError::InvalidProduct)
        ));
        assert!(matches!(
            update_product_reorder_level(&connection, i64::MAX, 5),
            Err(InventoryError::InvalidProductId)
        ));
    }

    #[test]
    fn stores_categories_and_independently_priced_sale_units() {
        let (_directory, connection, product_id) = setup_inventory();
        let unit_id = save_product_sale_unit(&connection, product_id, None, "شريط", 10, 8500)
            .expect("create independently priced sale unit");
        update_product_category(&connection, product_id, "مسكنات").expect("categorize product");
        update_product_sale_price(&connection, product_id, 1500).expect("update base unit price");

        let product = &list_products(&connection).expect("list products")[0];
        assert_eq!(product.category, "مسكنات");
        assert_eq!(product.sale_price_minor, 1500);
        assert_eq!(product.sale_units.len(), 2);
        assert!(product.sale_units.iter().any(|unit| {
            unit.id == unit_id
                && unit.name == "شريط"
                && unit.base_units_per_unit == 10
                && unit.sale_price_minor == 8500
        }));
        assert!(product.sale_units.iter().any(|unit| {
            unit.is_base_unit && unit.name == "قرص" && unit.sale_price_minor == 1500
        }));
    }

    #[test]
    fn dispenses_unexpired_batches_in_expiry_order() {
        let (_directory, mut connection, product_id) = setup_inventory();
        let expired_batch = receive_batch(
            &mut connection,
            product_id,
            "OLD",
            "2026-11-18",
            9,
            "opening-old",
        )
        .expect("receive expired batch");
        let first_batch = receive_batch(
            &mut connection,
            product_id,
            "EARLIEST",
            "2026-11-25",
            4,
            "purchase-1",
        )
        .expect("receive earliest batch");
        let second_batch = receive_batch(
            &mut connection,
            product_id,
            "NEXT",
            "2026-12-10",
            6,
            "purchase-2",
        )
        .expect("receive next batch");

        let allocations =
            dispense_fefo_on_date(&mut connection, product_id, 7, "2026-11-19", "sale-1")
                .expect("dispense with FEFO");
        assert_eq!(
            allocations,
            vec![
                BatchAllocation {
                    batch_id: first_batch,
                    batch_number: "EARLIEST".to_owned(),
                    expiry_date: "2026-11-25".to_owned(),
                    units: 4,
                },
                BatchAllocation {
                    batch_id: second_batch,
                    batch_number: "NEXT".to_owned(),
                    expiry_date: "2026-12-10".to_owned(),
                    units: 3,
                },
            ]
        );

        let balances = batch_balances(&connection, product_id).expect("read batch balances");
        assert_eq!(balances.len(), 2);
        assert_eq!(
            list_products(&connection).expect("list sellable product stock")[0].available_units,
            3
        );
        assert!(!balances.iter().any(|batch| batch.batch_id == first_batch));
        assert_eq!(
            balances
                .iter()
                .find(|batch| batch.batch_id == expired_batch)
                .expect("expired stock remains visible in inventory")
                .available_units,
            9
        );
        assert_eq!(
            balances
                .iter()
                .find(|batch| batch.batch_id == second_batch)
                .expect("remaining unexpired stock")
                .available_units,
            3
        );
    }

    #[test]
    fn insufficient_stock_does_not_partially_dispense() {
        let (_directory, mut connection, product_id) = setup_inventory();
        receive_batch(
            &mut connection,
            product_id,
            "ONLY",
            "2026-12-10",
            5,
            "purchase-1",
        )
        .expect("receive batch");

        let error = dispense_fefo_on_date(&mut connection, product_id, 6, "2026-11-19", "sale-1")
            .expect_err("reject insufficient stock");
        assert!(matches!(
            error,
            InventoryError::InsufficientStock {
                requested_units: 6,
                available_units: 5
            }
        ));
        let balance = batch_balances(&connection, product_id).expect("read balances");
        assert_eq!(balance[0].available_units, 5);
    }

    #[test]
    fn fefo_deductions_participate_in_the_callers_transaction() {
        let (_directory, mut connection, product_id) = setup_inventory();
        let batch_id = receive_batch(
            &mut connection,
            product_id,
            "ROLLBACK",
            "2026-12-10",
            5,
            "purchase-1",
        )
        .expect("receive batch");

        {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .expect("begin caller transaction");
            let allocations = dispense_fefo_in_transaction(
                &transaction,
                product_id,
                3,
                "2026-11-19",
                "sale-rollback",
            )
            .expect("allocate within caller transaction");
            assert_eq!(allocations[0].units, 3);
        }

        let balances = batch_balances(&connection, product_id).expect("read balances");
        assert_eq!(balances[0].batch_id, batch_id);
        assert_eq!(balances[0].available_units, 5);
    }

    #[test]
    fn rejects_invalid_quantities_and_immutable_movement_edits() {
        let (_directory, mut connection, product_id) = setup_inventory();
        assert!(matches!(
            receive_batch(
                &mut connection,
                product_id,
                "ZERO",
                "2026-12-10",
                0,
                "purchase-zero"
            ),
            Err(InventoryError::InvalidQuantity)
        ));
        assert!(matches!(
            receive_batch(
                &mut connection,
                product_id,
                "BAD-DATE",
                "2026-13-01",
                1,
                "purchase-bad-date"
            ),
            Err(InventoryError::InvalidDate)
        ));
        let batch_id = receive_batch(
            &mut connection,
            product_id,
            "VALID",
            "2026-12-10",
            5,
            "purchase-1",
        )
        .expect("receive batch");

        assert!(connection
            .execute(
                "INSERT INTO stock_movements (batch_id, delta_units, movement_type)
                     VALUES (?1, -1.5, 'dispense')",
                [batch_id]
            )
            .is_err());
        assert!(connection
            .execute(
                "UPDATE stock_movements SET delta_units = 4 WHERE batch_id = ?1",
                [batch_id]
            )
            .is_err());
        assert!(connection
            .execute(
                "DELETE FROM stock_movements WHERE batch_id = ?1",
                [batch_id]
            )
            .is_err());
        assert!(connection
            .execute(
                "INSERT INTO stock_movements (batch_id, delta_units, movement_type)
                     VALUES (?1, -6, 'dispense')",
                [batch_id]
            )
            .is_err());
    }

    #[test]
    fn disabled_products_cannot_receive_or_dispense_stock() {
        let (_directory, mut connection, product_id) = setup_inventory();
        connection
            .execute(
                "UPDATE products SET is_enabled = 0 WHERE id = ?1",
                [product_id],
            )
            .expect("disable product");

        assert!(matches!(
            receive_batch(
                &mut connection,
                product_id,
                "DISABLED",
                "2026-12-10",
                5,
                "purchase-1"
            ),
            Err(InventoryError::ProductDisabled)
        ));
        assert!(matches!(
            dispense_fefo_on_date(&mut connection, product_id, 1, "2026-11-19", "sale-1"),
            Err(InventoryError::ProductDisabled)
        ));
    }
}
