#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod inventory;
mod operations;

use std::collections::HashMap;
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
    sale_price_minor: i64,
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
        sale_price_minor,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn update_product_sale_price(
    state: tauri::State<'_, DatabaseState>,
    product_id: i64,
    sale_price_minor: i64,
) -> Result<(), String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    inventory::update_product_sale_price(&connection, product_id, sale_price_minor)
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

#[tauri::command]
fn list_products(
    state: tauri::State<'_, DatabaseState>,
) -> Result<Vec<inventory::ProductSummary>, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    inventory::list_products(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_dashboard(
    state: tauri::State<'_, DatabaseState>,
) -> Result<operations::DashboardSummary, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    operations::dashboard(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_customers(
    state: tauri::State<'_, DatabaseState>,
) -> Result<Vec<operations::CustomerSummary>, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    operations::list_customers(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
fn create_customer(
    state: tauri::State<'_, DatabaseState>,
    name: String,
    phone: Option<String>,
) -> Result<i64, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    operations::create_customer(&connection, &name, phone.as_deref())
}

#[tauri::command]
fn list_purchases(
    state: tauri::State<'_, DatabaseState>,
) -> Result<Vec<operations::PurchaseSummary>, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    operations::list_purchases(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_sales(
    state: tauri::State<'_, DatabaseState>,
) -> Result<Vec<operations::SaleSummary>, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    operations::list_sales(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
fn create_purchase(
    state: tauri::State<'_, DatabaseState>,
    reference_number: String,
    supplier_name: String,
    product_id: i64,
    batch_number: String,
    expiry_date: String,
    quantity: i64,
    unit_cost_minor: i64,
) -> Result<i64, String> {
    let mut connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    operations::create_purchase(
        &mut connection,
        &reference_number,
        &supplier_name,
        product_id,
        &batch_number,
        &expiry_date,
        quantity,
        unit_cost_minor,
    )
}

#[tauri::command]
fn get_setting(state: tauri::State<'_, DatabaseState>, key: String) -> Result<String, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    operations::get_setting(&connection, &key).map_err(|error| error.to_string())
}

#[tauri::command]
fn set_setting(
    state: tauri::State<'_, DatabaseState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    operations::set_setting(&connection, &key, &value).map_err(|error| error.to_string())
}

#[tauri::command]
fn set_settings(
    state: tauri::State<'_, DatabaseState>,
    settings: HashMap<String, String>,
) -> Result<(), String> {
    let mut connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    operations::set_settings(&mut connection, &settings).map_err(|error| error.to_string())
}

#[tauri::command]
fn create_sale(
    state: tauri::State<'_, DatabaseState>,
    customer_id: Option<i64>,
    items: Vec<operations::SaleCartItem>,
    status: String,
) -> Result<operations::CreatedSale, String> {
    let mut connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    operations::create_sale(&mut connection, customer_id, &items, &status)
}

fn main() {
    tracing_subscriber::fmt().with_target(false).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
            update_product_sale_price,
            receive_batch,
            dispense_fefo,
            get_batch_balances,
            list_products,
            get_dashboard,
            list_customers,
            create_customer,
            list_purchases,
            list_sales,
            create_purchase,
            get_setting,
            set_setting,
            set_settings,
            create_sale
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Pharmacy Management");
}
