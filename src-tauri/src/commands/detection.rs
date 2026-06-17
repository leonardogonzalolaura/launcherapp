use std::path::{Path, PathBuf};
use std::fs;
use walkdir::WalkDir;
use regex::Regex;
use serde::{Serialize, Deserialize};
use tauri::command;
use crate::models::project::ProjectType;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedInfo {
    pub project_type: ProjectType,
    pub version: Option<String>,
    pub available_commands: Vec<String>,
    pub config_files: Vec<PathBuf>,
    pub has_env_file: bool,
}

pub struct ProjectDetector;

impl ProjectDetector {
    pub fn detect_project(path: &Path) -> Option<DetectedInfo> {
        // Detectar por archivos característicos
        if path.join("package.json").exists() {
            // First try React-specific detection
            let react = Self::detect_react_project(path);
            if react.is_some() {
                return react;
            }
            // Fallback to generic JavaScript/TypeScript project
            return Self::detect_javascript_project(path);
        } else if path.join("build.sbt").exists() {
            return Self::detect_scala_project(path);
        } else if Self::find_csproj(path).is_some() {
            return Self::detect_csharp_project(path);
        } else if Self::has_python_files(path) {
            return Self::detect_python_project(path);
        }
        
        None
    }
    
    pub fn detect_react_project(path: &Path) -> Option<DetectedInfo> {
        let package_json_path = path.join("package.json");
        if let Ok(content) = fs::read_to_string(package_json_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                // CORREGIDO: Crear variables para los valores temporales
                let empty_obj = serde_json::json!({});
                let scripts = json.get("scripts").unwrap_or(&empty_obj);
                let mut commands = Vec::new();
                
                // Detectar scripts comunes
                for script in ["dev", "start", "build", "test", "preview"] {
                    if scripts.get(script).is_some() {
                        commands.push(script.to_string());
                    }
                }
                
                // Añadir scripts personalizados
                if let Some(scripts_obj) = scripts.as_object() {
                    for (key, _) in scripts_obj {
                        if !["dev", "start", "build", "test", "preview"].contains(&key.as_str()) {
                            commands.push(key.clone());
                        }
                    }
                }
                
                // CORREGIDO: Crear variable para el objeto vacío de dependencias
                let empty_deps = serde_json::json!({});
                let deps = json.get("dependencies").unwrap_or(&empty_deps);
                let react_version = deps.get("react")
                    .and_then(|v| v.as_str())
                    .map(|v| v.to_string());
                
                return Some(DetectedInfo {
                    project_type: ProjectType::React,
                    version: react_version,
                    available_commands: commands,
                    config_files: vec![path.join("package.json")],
                    has_env_file: path.join(".env").exists(),
                });
            }
        }
        None
    }
    
    pub fn detect_scala_project(path: &Path) -> Option<DetectedInfo> {
        let build_sbt = path.join("build.sbt");
        if build_sbt.exists() {
            let content = fs::read_to_string(build_sbt).ok()?;
            // CORREGIDO: usar raw string con comillas dobles sin escapar
            let scala_version_re = Regex::new(r#"scalaVersion\s*:=\s*"([^"]+)""#).unwrap();
            let version = scala_version_re.captures(&content)
                .and_then(|cap| cap.get(1).map(|m| m.as_str().to_string()));
            
            let mut commands = vec!["run".to_string(), "compile".to_string(), "test".to_string()];
            
            // Detectar si tiene assembly plugin
            if content.contains("assembly") {
                commands.push("assembly".to_string());
            }
            
            Some(DetectedInfo {
                project_type: ProjectType::Scala,
                version,
                available_commands: commands,
                config_files: vec![path.join("build.sbt")],
                has_env_file: path.join(".env").exists(),
            })
        } else {
            None
        }
    }
    
    pub fn detect_csharp_project(path: &Path) -> Option<DetectedInfo> {
        if let Some(csproj) = Self::find_csproj(path) {
            let mut commands = vec!["build".to_string(), "run".to_string()];
            
            // Detectar si tiene tests
            if Self::find_test_project(path).is_some() {
                commands.push("test".to_string());
            }
            
            Some(DetectedInfo {
                project_type: ProjectType::CSharp,
                version: None,
                available_commands: commands,
                config_files: vec![csproj],
                has_env_file: path.join("appsettings.json").exists() || path.join(".env").exists(),
            })
        } else {
            None
        }
    }
    
    pub fn detect_javascript_project(path: &Path) -> Option<DetectedInfo> {
        let package_json_path = path.join("package.json");
        if let Ok(content) = fs::read_to_string(package_json_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                let empty_obj = serde_json::json!({});
                let scripts = json.get("scripts").unwrap_or(&empty_obj);
                let mut commands = Vec::new();

                for script in ["dev", "start", "build", "test", "preview"] {
                    if scripts.get(script).is_some() {
                        commands.push(script.to_string());
                    }
                }

                if let Some(scripts_obj) = scripts.as_object() {
                    for (key, _) in scripts_obj {
                        if !["dev", "start", "build", "test", "preview"].contains(&key.as_str()) {
                            commands.push(key.clone());
                        }
                    }
                }

                let mut config_files = vec![path.join("package.json")];
                if path.join("tsconfig.json").exists() {
                    config_files.push(path.join("tsconfig.json"));
                }
                if path.join("vite.config.ts").exists() {
                    config_files.push(path.join("vite.config.ts"));
                } else if path.join("vite.config.js").exists() {
                    config_files.push(path.join("vite.config.js"));
                }
                if path.join("webpack.config.js").exists() {
                    config_files.push(path.join("webpack.config.js"));
                }
                if path.join(".eslintrc.js").exists() || path.join(".eslintrc.json").exists() {
                    config_files.push(path.join(".eslintrc.js"));
                }

                return Some(DetectedInfo {
                    project_type: ProjectType::JavaScript,
                    version: None,
                    available_commands: commands,
                    config_files,
                    has_env_file: path.join(".env").exists(),
                });
            }
        }
        None
    }

    pub fn detect_python_project(path: &Path) -> Option<DetectedInfo> {
        let mut commands = Vec::new();
        let mut config_files = Vec::new();
        
        // Buscar archivos principales
        let main_files = ["main.py", "app.py", "run.py", "manage.py", "wsgi.py"];
        for file in main_files {
            if path.join(file).exists() {
                commands.push(format!("run:{}", file));
                config_files.push(path.join(file));
            }
        }
        
        // Detectar requirements
        if path.join("requirements.txt").exists() {
            config_files.push(path.join("requirements.txt"));
        }
        
        // Detectar pyproject.toml (Poetry)
        if path.join("pyproject.toml").exists() {
            config_files.push(path.join("pyproject.toml"));
        }
        
        if !commands.is_empty() {
            Some(DetectedInfo {
                project_type: ProjectType::Python,
                version: None,
                available_commands: commands,
                config_files,
                has_env_file: path.join(".env").exists(),
            })
        } else {
            None
        }
    }
    
    pub fn find_csproj(path: &Path) -> Option<PathBuf> {
        for entry in WalkDir::new(path)
            .max_depth(3)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if entry.path().extension().and_then(|e| e.to_str()) == Some("csproj") {
                return Some(entry.path().to_path_buf());
            }
        }
        None
    }
    
    pub fn find_test_project(path: &Path) -> Option<PathBuf> {
        for entry in WalkDir::new(path)
            .max_depth(3)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let file_name = entry.file_name().to_string_lossy();
            if file_name.contains("Test") && file_name.ends_with(".csproj") {
                return Some(entry.path().to_path_buf());
            }
        }
        None
    }
    
    fn has_python_files(path: &Path) -> bool {
        WalkDir::new(path)
            .max_depth(2)
            .into_iter()
            .filter_map(|e| e.ok())
            .any(|e| e.path().extension().and_then(|e| e.to_str()) == Some("py"))
    }
}

#[command]
pub async fn detect_project_from_path(path: String) -> Result<DetectedInfo, String> {
    let project_path = PathBuf::from(&path);
    
    if !project_path.exists() {
        return Err("Path does not exist".to_string());
    }
    
    ProjectDetector::detect_project(&project_path)
        .ok_or_else(|| "Could not detect project type".to_string())
}