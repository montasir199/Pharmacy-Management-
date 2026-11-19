#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;

use std::sync::Mutex;
use tauri::Manager;

pub struct DatabaseState {
    pub connection: Mutex<rusqlite::Connection>,
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
        .run(tauri::generate_context!())
        .expect("failed to run Pharmacy Management");
}
