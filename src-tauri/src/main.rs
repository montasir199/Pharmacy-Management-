#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod inventory;
mod operations;
mod printing;

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
    category: Option<String>,
) -> Result<i64, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    inventory::create_product_with_category(
        &connection,
        &sku,
        barcode.as_deref(),
        &name_ar,
        &name_en,
        &base_unit,
        reorder_level_units,
        sale_price_minor,
        category.as_deref(),
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn update_product_category(
    state: tauri::State<'_, DatabaseState>,
    product_id: i64,
    category: String,
) -> Result<(), String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    inventory::update_product_category(&connection, product_id, &category)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_product_sale_unit(
    state: tauri::State<'_, DatabaseState>,
    product_id: i64,
    sale_unit_id: Option<i64>,
    name: String,
    base_units_per_unit: i64,
    sale_price_minor: i64,
) -> Result<i64, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    inventory::save_product_sale_unit(
        &connection,
        product_id,
        sale_unit_id,
        &name,
        base_units_per_unit,
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
fn update_product_reorder_level(
    state: tauri::State<'_, DatabaseState>,
    product_id: i64,
    reorder_level_units: i64,
) -> Result<(), String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    inventory::update_product_reorder_level(&connection, product_id, reorder_level_units)
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
fn list_currencies(
    state: tauri::State<'_, DatabaseState>,
) -> Result<Vec<operations::CurrencySummary>, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    operations::list_currencies(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_pos_drafts(
    state: tauri::State<'_, DatabaseState>,
) -> Result<Vec<operations::PosDraft>, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    operations::list_pos_drafts(&connection)
}

#[tauri::command]
fn create_pos_draft(
    state: tauri::State<'_, DatabaseState>,
) -> Result<operations::PosDraft, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    operations::create_pos_draft(&connection)
}

#[tauri::command]
fn save_pos_draft(
    state: tauri::State<'_, DatabaseState>,
    draft: operations::PosDraft,
) -> Result<(), String> {
    let mut connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    operations::save_pos_draft(&mut connection, &draft)
}

#[tauri::command]
fn delete_pos_draft(state: tauri::State<'_, DatabaseState>, draft_id: i64) -> Result<(), String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    operations::delete_pos_draft(&connection, draft_id)
}

#[tauri::command]
fn get_sale(
    state: tauri::State<'_, DatabaseState>,
    sale_id: i64,
) -> Result<operations::SaleDetail, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    operations::get_sale(&connection, sale_id)
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
    payments: Vec<operations::SalePaymentInput>,
    currency_code: String,
    exchange_rate_scaled: i64,
) -> Result<operations::CreatedSale, String> {
    let mut connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    operations::create_sale(
        &mut connection,
        customer_id,
        &items,
        &status,
        &payments,
        &currency_code,
        exchange_rate_scaled,
    )
}

#[tauri::command]
fn create_sale_with_units(
    state: tauri::State<'_, DatabaseState>,
    customer_id: Option<i64>,
    items: Vec<operations::SaleUnitCartItem>,
    status: String,
    payments: Vec<operations::SalePaymentInput>,
    currency_code: String,
    exchange_rate_scaled: i64,
) -> Result<operations::CreatedSale, String> {
    let mut connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    operations::create_sale_with_units(
        &mut connection,
        customer_id,
        &items,
        &status,
        &payments,
        &currency_code,
        exchange_rate_scaled,
    )
}

#[tauri::command]
fn list_printers(
    state: tauri::State<'_, DatabaseState>,
) -> Result<Vec<printing::PrinterConfig>, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    printing::list_printers(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_printer(
    state: tauri::State<'_, DatabaseState>,
    printer: printing::PrinterConfig,
) -> Result<i64, String> {
    let mut connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    printing::save_printer(&mut connection, printer)
}

#[tauri::command]
fn remove_printer(state: tauri::State<'_, DatabaseState>, printer_id: i64) -> Result<(), String> {
    let mut connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    printing::remove_printer(&mut connection, printer_id)
}

#[tauri::command]
async fn discover_usb_printers() -> Result<Vec<printing::UsbPrinter>, String> {
    tauri::async_runtime::spawn_blocking(printing::discover_usb_printers)
        .await
        .map_err(|error| format!("USB discovery worker failed: {error}"))?
}

#[tauri::command]
async fn discover_network_printers() -> Result<Vec<printing::NetworkPrinter>, String> {
    tauri::async_runtime::spawn_blocking(printing::discover_network_printers)
        .await
        .map_err(|error| format!("network discovery worker failed: {error}"))?
}

#[tauri::command]
fn list_print_jobs(
    state: tauri::State<'_, DatabaseState>,
) -> Result<Vec<printing::PrintJobSummary>, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    printing::list_jobs(&connection).map_err(|error| error.to_string())
}

async fn complete_print_job(
    app: tauri::AppHandle,
    prepared: printing::PreparedPrint,
) -> Result<printing::PrintJobSummary, String> {
    let job_id = prepared.job_id;
    let result = match tauri::async_runtime::spawn_blocking(move || {
        printing::send_prepared(&prepared)
    })
    .await
    {
        Ok(result) => result,
        Err(error) => Err(format!("printer worker failed: {error}")),
    };
    let state = app.state::<DatabaseState>();
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database state is unavailable".to_owned())?;
    printing::complete_job(&connection, job_id, result)
}

#[tauri::command]
async fn print_sale_receipt(
    app: tauri::AppHandle,
    sale_id: i64,
    printer_id: Option<i64>,
    png_base64: String,
) -> Result<printing::PrintJobSummary, String> {
    let state = app.state::<DatabaseState>();
    let prepared = {
        let mut connection = state
            .connection
            .lock()
            .map_err(|_| "database state is unavailable".to_owned())?;
        printing::prepare_sale(&mut connection, sale_id, printer_id, &png_base64)?
    };
    complete_print_job(app, prepared).await
}

#[tauri::command]
async fn print_test_page(
    app: tauri::AppHandle,
    printer_id: i64,
    png_base64: String,
) -> Result<printing::PrintJobSummary, String> {
    let state = app.state::<DatabaseState>();
    let prepared = {
        let mut connection = state
            .connection
            .lock()
            .map_err(|_| "database state is unavailable".to_owned())?;
        printing::prepare_test(&mut connection, printer_id, &png_base64)?
    };
    complete_print_job(app, prepared).await
}

#[tauri::command]
async fn retry_print_job(
    app: tauri::AppHandle,
    job_id: i64,
    png_base64: String,
) -> Result<printing::PrintJobSummary, String> {
    let state = app.state::<DatabaseState>();
    let prepared = {
        let mut connection = state
            .connection
            .lock()
            .map_err(|_| "database state is unavailable".to_owned())?;
        printing::prepare_retry(&mut connection, job_id, &png_base64)?
    };
    complete_print_job(app, prepared).await
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
            {
                let state = app.state::<DatabaseState>();
                let connection = state
                    .connection
                    .lock()
                    .map_err(|_| "database state is unavailable")?;
                printing::recover_interrupted_jobs(&connection)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_product,
            update_product_category,
            save_product_sale_unit,
            update_product_sale_price,
            update_product_reorder_level,
            receive_batch,
            dispense_fefo,
            get_batch_balances,
            list_products,
            get_dashboard,
            list_customers,
            create_customer,
            list_purchases,
            list_sales,
            list_currencies,
            list_pos_drafts,
            create_pos_draft,
            save_pos_draft,
            delete_pos_draft,
            get_sale,
            create_purchase,
            get_setting,
            set_setting,
            set_settings,
            create_sale,
            create_sale_with_units,
            list_printers,
            save_printer,
            remove_printer,
            discover_usb_printers,
            discover_network_printers,
            list_print_jobs,
            print_sale_receipt,
            print_test_page,
            retry_print_job
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Pharmacy Management");
}
