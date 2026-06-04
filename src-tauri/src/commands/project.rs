use std::path::PathBuf;
use std::collections::HashMap;
use tauri::command;
use uuid::Uuid;
use super::super::models::project::{Project, ProjectConfig, CustomPaths, ProjectType};
use super::detection::{ProjectDetector, DetectedInfo};
use crate::AppState; 

#[command]
pub async fn add_project(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<Project, String> {
    let project_path = PathBuf::from(&path);
    
    if !project_path.exists() {
        return Err("Path does not exist".to_string());
    }
    
    // Detectar tipo de proyecto
    let detected = ProjectDetector::detect_project(&project_path)
        .ok_or("Could not detect project type")?;
    
    // Crear configuraciones por defecto según el tipo
    let configurations = create_default_configs(&detected, &project_path);
    
    let project = Project {
        id: Uuid::new_v4().to_string(),
        name: project_path.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        path: project_path.clone(), 
        project_type: detected.project_type,
        language_version: detected.version,
        configurations,
        env_files: if detected.has_env_file {
            vec![project_path.join(".env")]
        } else {
            vec![]
        },
        last_used: Some(chrono::Local::now()),
    };
    
    // Guardar en estado
    let mut projects = state.projects.lock().await;
    projects.insert(project.id.clone(), project.clone());
    
    // Persistir a archivo
    save_projects_to_file(&projects).await?;
    
    Ok(project)
}

fn create_default_configs(detected: &DetectedInfo, project_path: &PathBuf) -> Vec<ProjectConfig> {
    let mut configs = Vec::new();
    
    match detected.project_type {
        ProjectType::Python => {
            for cmd in &detected.available_commands {
                if cmd.starts_with("run:") {
                    let script_name = cmd.replace("run:", "");
                    configs.push(ProjectConfig {
                        name: script_name.clone(),
                        command: format!(
                            ".venv\\Scripts\\activate && python {}",
                            script_name
                        ),
                        working_dir: project_path.clone(),
                        env_vars: HashMap::from([
                            ("ENV".to_string(), "dev".to_string()),
                            ("PYTHONPATH".to_string(), ".".to_string()),
                        ]),
                        requires_build: false,
                        build_command: None,
                        custom_paths: CustomPaths::default(),
                    });
                }
            }
        }
        ProjectType::Scala => {
            configs.push(ProjectConfig {
                name: "run".to_string(),
                command: "sbt run".to_string(),
                working_dir: project_path.clone(),
                env_vars: HashMap::from([
                    ("ENV".to_string(), "dev".to_string()),
                ]),
                requires_build: false,
                build_command: Some("sbt compile".to_string()),
                custom_paths: CustomPaths {
                    java_home: None,
                    sbt_path: None,
                    ..Default::default()
                },
            });
            configs.push(ProjectConfig {
                name: "compile".to_string(),
                command: "sbt compile".to_string(),
                working_dir: project_path.clone(),
                env_vars: HashMap::new(),
                requires_build: true,
                build_command: None,
                custom_paths: CustomPaths::default(),
            });
        }
        ProjectType::CSharp => {
            if let Some(csproj) = ProjectDetector::find_csproj(project_path) {
                let _project_name = csproj.file_stem().unwrap_or_default().to_string_lossy();
                configs.push(ProjectConfig {
                    name: "run".to_string(),
                    command: format!("dotnet run --project {}", csproj.display()),
                    working_dir: project_path.clone(),
                    env_vars: HashMap::from([
                        ("ASPNETCORE_ENVIRONMENT".to_string(), "Development".to_string()),
                    ]),
                    requires_build: true,
                    build_command: Some(format!("dotnet build {}", csproj.display())),
                    custom_paths: CustomPaths::default(),
                });
            }
        }
        ProjectType::React => {
            for cmd in &detected.available_commands {
                configs.push(ProjectConfig {
                    name: cmd.clone(),
                    command: format!("npm run {}", cmd),
                    working_dir: project_path.clone(),
                    env_vars: HashMap::new(),
                    requires_build: cmd == "build",
                    build_command: if cmd == "build" { None } else { Some("npm run build".to_string()) },
                    custom_paths: CustomPaths::default(),
                });
            }
        }
        _ => {}
    }
    
    configs
}

// Persistencia
async fn save_projects_to_file(projects: &HashMap<String, Project>) -> Result<(), String> {
    let config_dir = dirs::config_dir()
        .ok_or("Could not find config dir")?
        .join("project-launcher");
    
    tokio::fs::create_dir_all(&config_dir).await
        .map_err(|e| e.to_string())?;
    
    let config_file = config_dir.join("projects.json");
    let data = serde_json::to_string_pretty(projects)
        .map_err(|e| e.to_string())?;
    
    tokio::fs::write(config_file, data).await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn get_projects(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Project>, String> {
    let projects = state.projects.lock().await;
    let projects_vec: Vec<Project> = projects.values().cloned().collect();
    Ok(projects_vec)
}

#[command]
pub async fn remove_project(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let mut projects = state.projects.lock().await;
    
    if projects.remove(&id).is_some() {
        save_projects_to_file(&projects).await?;
        Ok(())
    } else {
        Err("Project not found".to_string())
    }
}

#[command]
pub async fn update_project_config(
    state: tauri::State<'_, AppState>,
    project_id: String,
    config_index: usize,
    updated_config: ProjectConfig,
) -> Result<Project, String> {
    // Primer bloque: modificar el proyecto
    let updated_project = {
        let mut projects = state.projects.lock().await;
        
        let project = projects.get_mut(&project_id)
            .ok_or("Project not found")?;
        
        if config_index >= project.configurations.len() {
            return Err("Configuration index out of bounds".to_string());
        }
        
        project.configurations[config_index] = updated_config;
        project.clone() // Clonar antes de que termine el bloque
    }; // El lock se libera aquí automáticamente
    
    // Segundo bloque: guardar con un lock nuevo
    {
        let projects = state.projects.lock().await;
        save_projects_to_file(&projects).await?;
    }
    
    Ok(updated_project)
}

#[command]
pub async fn add_custom_command(
    state: tauri::State<'_, AppState>,
    project_id: String,
    new_config: ProjectConfig,
) -> Result<Project, String> {
    let updated_project = {
        let mut projects = state.projects.lock().await;
        let project = projects.get_mut(&project_id).ok_or("Project not found")?;
        project.configurations.push(new_config);
        project.clone()
    };

    {
        let projects = state.projects.lock().await;
        save_projects_to_file(&projects).await?;
    }

    Ok(updated_project)
}

#[command]
pub async fn delete_project_config(
    state: tauri::State<'_, AppState>,
    project_id: String,
    config_index: usize,
) -> Result<Project, String> {
    let updated_project = {
        let mut projects = state.projects.lock().await;
        let project = projects.get_mut(&project_id).ok_or("Project not found")?;

        if config_index >= project.configurations.len() {
            return Err("Configuration index out of bounds".to_string());
        }

        project.configurations.remove(config_index);
        project.clone()
    };

    {
        let projects = state.projects.lock().await;
        save_projects_to_file(&projects).await?;
    }

    Ok(updated_project)
}

pub async fn load_projects_from_file() -> Result<HashMap<String, Project>, String> {
    let config_dir = dirs::config_dir()
        .ok_or("Could not find config dir")?
        .join("launcherapp");
    
    let config_file = config_dir.join("projects.json");
    
    if !config_file.exists() {
        return Ok(HashMap::new());
    }
    
    let data = tokio::fs::read_to_string(config_file).await
        .map_err(|e| e.to_string())?;
    
    let projects: HashMap<String, Project> = serde_json::from_str(&data)
        .map_err(|e| e.to_string())?;
    
    Ok(projects)
}