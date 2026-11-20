use std::{
    fs,
    path::Path,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use rusqlite::{backup::Backup, Connection};
use rusqlite_migration::{Migrations, M};
use thiserror::Error;

const DATABASE_FILE: &str = "pharmacy.sqlite3";

#[derive(Debug, Error)]
pub enum DatabaseError {
    #[error("database filesystem operation failed")]
    Io(#[from] std::io::Error),
    #[error("SQLite operation failed: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("database migration failed")]
    Migration(#[from] rusqlite_migration::Error),
    #[error("the database schema is newer than this application ({0} unsupported migration(s))")]
    NewerSchema(i32),
    #[error("system clock is earlier than the Unix epoch")]
    Clock(#[from] std::time::SystemTimeError),
}

pub(crate) fn migrations() -> Migrations<'static> {
    Migrations::new(vec![
        M::up(include_str!("../migrations/0001_core.sql")),
        M::up(include_str!("../migrations/0002_inventory.sql")),
        M::up(include_str!("../migrations/0003_operations.sql")),
        M::up(include_str!(
            "../migrations/0004_sales_and_pharmacy_settings.sql"
        )),
        M::up(include_str!("../migrations/0005_pos_payments.sql")),
        M::up(include_str!("../migrations/0006_thermal_printing.sql")),
        M::up(include_str!("../migrations/0007_pos_workflow.sql")),
    ])
}

pub fn initialize(app_data_dir: &Path) -> Result<Connection, DatabaseError> {
    fs::create_dir_all(app_data_dir)?;

    let database_path = app_data_dir.join(DATABASE_FILE);
    let database_existed = database_path.exists();
    let mut connection = Connection::open(&database_path)?;
    connection.busy_timeout(Duration::from_secs(5))?;
    connection.execute_batch("PRAGMA foreign_keys = ON;")?;

    let migrations = migrations();
    let pending = migrations.pending_migrations(&connection)?;
    if pending < 0 {
        return Err(DatabaseError::NewerSchema(-pending));
    }

    if pending > 0 {
        if database_existed {
            create_pre_migration_backup(&connection, app_data_dir)?;
        }
    }

    connection.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;",
    )?;

    if pending > 0 {
        tracing::info!(
            pending_migrations = pending,
            database_path = %database_path.display(),
            "Applying database migrations"
        );
        migrations.to_latest(&mut connection)?;
    }

    Ok(connection)
}

fn create_pre_migration_backup(
    source: &Connection,
    app_data_dir: &Path,
) -> Result<(), DatabaseError> {
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
    let backup_path = app_data_dir.join(format!("pharmacy-pre-migration-{timestamp}.sqlite3"));
    let mut destination = Connection::open(&backup_path)?;
    {
        let backup = Backup::new(source, &mut destination)?;
        backup.run_to_completion(128, Duration::from_millis(25), None)?;
    }
    tracing::info!(backup_path = %backup_path.display(), "Created pre-migration database backup");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn migrated_memory_database() -> Connection {
        let mut connection = Connection::open_in_memory().expect("open in-memory database");
        migrations()
            .to_latest(&mut connection)
            .expect("apply initial migration");
        connection
    }

    #[test]
    fn stores_currency_rates_as_scaled_integers() {
        let connection = migrated_memory_database();
        connection
            .execute(
                "INSERT OR IGNORE INTO currencies (code, name, symbol, minor_unit_exponent)
                 VALUES ('SAR', 'Saudi Riyal', 'ر.س', 2), ('USD', 'US Dollar', '$', 2)",
                [],
            )
            .expect("insert currencies");
        connection
            .execute(
                "INSERT INTO exchange_rates
                 (base_currency_code, quote_currency_code, rate_scaled, effective_at)
                 VALUES ('USD', 'SAR', 375000000000, '2026-01-01T00:00:00Z')",
                [],
            )
            .expect("insert fixed-point rate");

        let stored_type: String = connection
            .query_row(
                "SELECT typeof(rate_scaled) FROM exchange_rates",
                [],
                |row| row.get(0),
            )
            .expect("read rate storage type");
        assert_eq!(stored_type, "integer");

        let fractional_rate = connection.execute(
            "INSERT INTO exchange_rates
             (base_currency_code, quote_currency_code, rate_scaled, effective_at)
             VALUES ('USD', 'SAR', 1.5, '2026-01-02T00:00:00Z')",
            [],
        );
        assert!(fractional_rate.is_err());
    }

    #[test]
    fn pos_migration_preserves_existing_products_and_invoice_quantities() {
        let mut connection = Connection::open_in_memory().expect("open in-memory database");
        migrations()
            .to_version(&mut connection, 6)
            .expect("apply existing migrations");
        connection
            .execute(
                "INSERT INTO products (sku, name_ar, name_en, base_unit, sale_price_minor)
                 VALUES ('MED-MIGRATION', 'دواء', 'Medicine', 'حبة', 250)",
                [],
            )
            .expect("create pre-migration product");
        connection
            .execute(
                "INSERT INTO sales
                 (invoice_number, subtotal_minor, discount_minor, tax_minor, total_minor,
                  status, currency_code, exchange_rate_scaled, tax_rate_basis_points)
                 VALUES ('INV-MIGRATION', 1000, 0, 0, 1000, 'paid', 'SAR', 1000000000, 0)",
                [],
            )
            .expect("create pre-migration sale");
        connection
            .execute(
                "INSERT INTO sale_items
                 (sale_id, product_id, quantity, unit_price_minor, line_total_minor, discount_minor)
                 VALUES (1, 1, 4, 250, 1000, 0)",
                [],
            )
            .expect("create pre-migration sale item");

        migrations()
            .to_latest(&mut connection)
            .expect("apply POS migration");

        let (category, unit_name, unit_price, unit_multiplier, sold_quantity): (
            String,
            String,
            i64,
            i64,
            i64,
        ) = connection
            .query_row(
                "SELECT products.category, product_sale_units.name,
                        product_sale_units.sale_price_minor, product_sale_units.base_units_per_unit,
                        sale_items.sold_quantity
                 FROM products
                 JOIN product_sale_units ON product_sale_units.product_id = products.id
                 JOIN sale_items ON sale_items.product_id = products.id",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .expect("read migrated POS records");

        assert_eq!(category, "");
        assert_eq!(unit_name, "حبة");
        assert_eq!(unit_price, 250);
        assert_eq!(unit_multiplier, 1);
        assert_eq!(sold_quantity, 4);
    }

    #[test]
    fn backs_up_an_existing_database_before_migrating_and_only_once() {
        let directory = tempfile::tempdir().expect("create temporary data directory");
        let database_path = directory.path().join(DATABASE_FILE);
        let mut legacy = Connection::open(&database_path).expect("create existing database");
        migrations()
            .to_version(&mut legacy, 1)
            .expect("create phase-three schema");
        legacy
            .execute_batch("CREATE TABLE legacy_marker (value TEXT);")
            .expect("create legacy marker");
        drop(legacy);

        let connection = initialize(directory.path()).expect("initialize and migrate database");
        drop(connection);

        let backups = fs::read_dir(directory.path())
            .expect("read data directory")
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("pharmacy-pre-migration-"))
            })
            .collect::<Vec<_>>();
        assert_eq!(backups.len(), 1);

        let backup = Connection::open(&backups[0]).expect("open pre-migration backup");
        let legacy_table_exists: bool = backup
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'legacy_marker')",
                [],
                |row| row.get(0),
            )
            .expect("check original table in backup");
        let inventory_table_exists: bool = backup
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'products')",
                [],
                |row| row.get(0),
            )
            .expect("check migration was not applied to backup");
        assert!(legacy_table_exists);
        assert!(!inventory_table_exists);

        initialize(directory.path()).expect("reopen migrated database");
        let backup_count = fs::read_dir(directory.path())
            .expect("read data directory")
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("pharmacy-pre-migration-")
            })
            .count();
        assert_eq!(backup_count, 1);
    }

    #[test]
    fn refuses_a_database_from_a_newer_schema_version() {
        let directory = tempfile::tempdir().expect("create temporary data directory");
        let connection =
            Connection::open(directory.path().join(DATABASE_FILE)).expect("create database file");
        connection
            .pragma_update(None, "user_version", 8)
            .expect("set future schema version");
        drop(connection);

        let error = initialize(directory.path()).expect_err("reject unsupported schema");
        assert!(matches!(error, DatabaseError::NewerSchema(1)));
    }
}
