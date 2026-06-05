// src-tauri/src/lib.rs
pub mod commands;
pub mod models;
pub mod utils;

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use commands::process::ProcessManager;
use models::project::Project;

pub struct AppState {
    pub projects: Arc<Mutex<HashMap<String, Project>>>,
    pub process_manager: Arc<ProcessManager>,
}

#[tokio::main]
pub async fn run() {
    let projects = match commands::project::load_projects_from_file().await {
        Ok(proj) => proj,
        Err(_) => HashMap::new(),
    };

    let state = AppState {
        projects: Arc::new(Mutex::new(projects)),
        process_manager: Arc::new(ProcessManager::new()),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::project::add_project,
            commands::project::get_projects,
            commands::project::remove_project,
            commands::project::clear_all_projects,
            commands::project::update_project_config,
            commands::project::add_custom_command,
            commands::project::delete_project_config,
            commands::process::spawn_project_command,
            commands::process::stop_process,
            commands::process::get_active_processes,
            commands::detection::detect_project_from_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
