use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use super::project::Project;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub version: String,
    pub recent_projects: Vec<String>,
    pub settings: Settings,
    pub projects: HashMap<String, Project>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub auto_detect_projects: bool,
    pub scan_directories: Vec<String>,
    pub theme: String,
    pub show_hidden_projects: bool,
    pub default_env_vars: HashMap<String, String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            recent_projects: Vec::new(),
            settings: Settings {
                auto_detect_projects: true,
                scan_directories: vec![],
                theme: "dark".to_string(),
                show_hidden_projects: false,
                default_env_vars: HashMap::new(),
            },
            projects: HashMap::new(),
        }
    }
}