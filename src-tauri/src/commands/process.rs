use std::process::Stdio; 
use tokio::process::{Command, Child}; 
use std::os::windows::process::CommandExt;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::command;
use serde::{Serialize, Deserialize};

const CREATE_NO_WINDOW: u32 = 0x08000000;

pub struct ProcessManager {
    active_processes: Arc<Mutex<HashMap<String, Child>>>, 
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            active_processes: Arc::new(Mutex::new(HashMap::new())),
        }
    }
    
    fn create_hidden_command(command: &str) -> Command {
        let mut cmd = Command::new("cmd");
        #[cfg(target_os = "windows")]
        {
            cmd.creation_flags(CREATE_NO_WINDOW);
            cmd.args(&["/C", command]);
        }
        #[cfg(not(target_os = "windows"))]
        {
            cmd.arg("-c");
            cmd.arg(command);
        }
        cmd
    }
    
    pub async fn execute_command(
        &self,
        command: &str,
        working_dir: &Path,
        env_vars: &HashMap<String, String>,
    ) -> Result<ExecutionResult, String> {
        let mut cmd = Self::create_hidden_command(command);
        cmd.current_dir(working_dir);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        
        // Aplicar variables de entorno
        for (key, value) in env_vars {
            cmd.env(key, value);
        }
        
        // .output() en tokio::process::Command es async
        let output = cmd.output().await.map_err(|e| e.to_string())?;
        
        Ok(ExecutionResult {
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            exit_code: output.status.code(),
        })
    }
    
    pub async fn execute_background(
    &self,
    id: String,
    command: &str,
    working_dir: &Path,
    env_vars: &HashMap<String, String>,
) -> Result<(), String> {
    let mut cmd = Self::create_hidden_command(command);
    cmd.current_dir(working_dir);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    
    for (key, value) in env_vars {
        cmd.env(key, value);
    }
    
    // QUITA el .await - spawn() NO es async
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    
    let mut processes = self.active_processes.lock().await;
    processes.insert(id, child);
    
    Ok(())
}
    
    pub async fn stop_process(&self, id: &str) -> Result<(), String> {
        let mut processes = self.active_processes.lock().await;
        if let Some(mut child) = processes.remove(id) {
            child.kill().await.map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

// El resto del código permanece igual...
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExecutionResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

#[command]
pub async fn execute_project_command(
    state: tauri::State<'_, crate::AppState>,
    project_id: String,
    config_name: String,
) -> Result<ExecutionResult, String> {
    let projects = state.projects.lock().await;
    let project = projects.get(&project_id).ok_or("Project not found")?;
    let config = project.configurations.iter()
        .find(|c| c.name == config_name)
        .ok_or("Config not found")?;
    
    let final_command = build_command_with_paths(config, project).await?;
    
    state.process_manager.execute_command(
        &final_command,
        &config.working_dir,
        &config.env_vars,
    ).await
}

#[command]
pub async fn stop_process(
    state: tauri::State<'_, crate::AppState>,
    process_id: String,
) -> Result<(), String> {
    state.process_manager.stop_process(&process_id).await
}

async fn build_command_with_paths(
    config: &crate::models::project::ProjectConfig,
    project: &crate::models::project::Project,
) -> Result<String, String> {
    let mut command = config.command.clone();
    
    if let Some(java_home) = &config.custom_paths.java_home {
        command = format!("set JAVA_HOME={} && {}", java_home, command);
    }
    
    if let Some(sbt_path) = &config.custom_paths.sbt_path {
        command = command.replace("sbt", &format!("\"{}\"", sbt_path));
    }
    
    if let Some(python_main) = &config.custom_paths.python_main {
        command = command.replace("main.py", python_main);
    }
    
    if let Some(dotnet_project) = &config.custom_paths.dotnet_project {
        command = command.replace("--project", &format!("--project \"{}\"", dotnet_project));
    }
    
    Ok(command)
}