use serde::{Serialize, Deserialize};
use std::path::PathBuf;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: PathBuf,
    pub project_type: ProjectType,
    pub language_version: Option<String>,
    pub configurations: Vec<ProjectConfig>,
    pub env_files: Vec<PathBuf>,
    pub last_used: Option<chrono::DateTime<chrono::Local>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ProjectType {
    Python,
    Scala,
    CSharp,
    React,
    JavaScript,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub name: String, 
    pub command: String,
    pub working_dir: PathBuf,
    pub env_vars: HashMap<String, String>,
    pub requires_build: bool,
    pub build_command: Option<String>,
    pub custom_paths: CustomPaths,
    #[serde(default)]
    pub group: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CustomPaths {
    pub python_main: Option<String>,
    pub java_home: Option<String>,
    pub sbt_path: Option<String>,
    pub dotnet_project: Option<String>,
    pub node_script: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedInfo {
    pub project_type: ProjectType,
    pub version: Option<String>,
    pub available_commands: Vec<String>,
    pub config_files: Vec<PathBuf>,
    pub has_env_file: bool,
}