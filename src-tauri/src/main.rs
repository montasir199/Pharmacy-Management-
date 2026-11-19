#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod inventory;

use std::sync::Mutex;
use tauri::Manager;

pub struct DatabaseState {
    pub connection: Mutex<rusqlite::Connection>,
}

#[tauri::command]
fn create_product(
    state: tauri::State<'_, DatabaseState>,
    sku: String,
    barcode: Option<String>,
    name_ar: String,
    name_en: String,
    base_unit: String,
    reorder_level_units: i64,
) -> Result<i64, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    inventory::create_product(
        &connection,
        &sku,
        barcode.as_deref(),
        &name_ar,
        &name_en,
        &base_unit,
        reorder_level_units,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn receive_batch(
    state: tauri::State<'_, DatabaseState>,
    product_id: i64,
    batch_number: String,
    expiry_date: String,
    units: i64,
    source_id: String,
) -> Result<i64, String> {
    let mut connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    inventory::receive_batch(
        &mut connection,
        product_id,
        &batch_number,
        &expiry_date,
        units,
        &source_id,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn dispense_fefo(
    state: tauri::State<'_, DatabaseState>,
    product_id: i64,
    requested_units: i64,
    source_id: String,
) -> Result<Vec<inventory::BatchAllocation>, String> {
    let mut connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    inventory::dispense_fefo(&mut connection, product_id, requested_units, &source_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_batch_balances(
    state: tauri::State<'_, DatabaseState>,
    product_id: i64,
) -> Result<Vec<inventory::BatchBalance>, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    inventory::batch_balances(&connection, product_id).map_err(|error| error.to_string())
}

fn main() {
    tracing_subscriber::fmt().with_target(false).init();

    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let connection = database::initialize(&app_data_dir)?;
            app.manage(DatabaseState {
                connection: Mutex::new(connection),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_product,
            receive_batch,
            dispense_fefo,
            get_batch_balances
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Pharmacy Management");
}
