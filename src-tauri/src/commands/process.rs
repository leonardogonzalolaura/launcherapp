use std::process::Stdio;
use tokio::process::Command;
use tokio::io::{AsyncBufReadExt, BufReader};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{command, AppHandle, Emitter};
use serde::{Serialize, Deserialize};
use uuid::Uuid;

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamMessage {
    pub process_id: String,
    pub project_name: String,
    pub config_name: String,
    pub output_type: String, // "stdout", "stderr", "info", "error", "exit"
    pub content: String,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcessInfo {
    pub id: String,
    pub project_id: String,
    pub project_name: String,
    pub config_name: String,
    pub command: String,
    pub status: String, // "running", "stopped", "error"
    pub started_at: String,
}

pub struct ProcessManager {
    pub active_processes: Arc<Mutex<HashMap<String, tokio::task::JoinHandle<()>>>>,
    pub process_info: Arc<Mutex<HashMap<String, ProcessInfo>>>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            active_processes: Arc::new(Mutex::new(HashMap::new())),
            process_info: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn build_command(command_str: &str, working_dir: &Path, env_vars: &HashMap<String, String>) -> Command {
        let mut cmd = Command::new("powershell");
        cmd.args(&["-NoProfile", "-NonInteractive", "-Command", command_str]);

        #[cfg(target_os = "windows")]
        {
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        cmd.current_dir(working_dir);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        for (k, v) in env_vars {
            cmd.env(k, v);
        }

        cmd
    }

    pub async fn spawn_streaming(
        &self,
        app_handle: AppHandle,
        process_id: String,
        project_id: String,
        project_name: String,
        config_name: String,
        command_str: String,
        working_dir: std::path::PathBuf,
        env_vars: HashMap<String, String>,
    ) -> Result<ProcessInfo, String> {
        // Build command
        let mut cmd = Self::build_command(&command_str, &working_dir, &env_vars);

        let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn process: {}", e))?;

        let stdout = child.stdout.take().expect("no stdout");
        let stderr = child.stderr.take().expect("no stderr");

        let now = chrono::Local::now().to_rfc3339();

        let info = ProcessInfo {
            id: process_id.clone(),
            project_id: project_id.clone(),
            project_name: project_name.clone(),
            config_name: config_name.clone(),
            command: command_str.clone(),
            status: "running".to_string(),
            started_at: now.clone(),
        };

        // Store info
        {
            let mut info_map = self.process_info.lock().await;
            info_map.insert(process_id.clone(), info.clone());
        }

        // Emit start event
        let _ = app_handle.emit("process-output", StreamMessage {
            process_id: process_id.clone(),
            project_name: project_name.clone(),
            config_name: config_name.clone(),
            output_type: "info".to_string(),
            content: format!("▶ Started: {}", command_str),
            timestamp: now.clone(),
        });

        // Spawn background task
        let pid = process_id.clone();
        let pname = project_name.clone();
        let cname = config_name.clone();
        let ah = app_handle.clone();
        let process_info_ref = self.process_info.clone();
        let active_ref = self.active_processes.clone();

        let handle = tokio::spawn(async move {
            let mut stdout_reader = BufReader::new(stdout).lines();
            let mut stderr_reader = BufReader::new(stderr).lines();

            loop {
                tokio::select! {
                    line = stdout_reader.next_line() => {
                        match line {
                            Ok(Some(text)) => {
                                let _ = ah.emit("process-output", StreamMessage {
                                    process_id: pid.clone(),
                                    project_name: pname.clone(),
                                    config_name: cname.clone(),
                                    output_type: "stdout".to_string(),
                                    content: text,
                                    timestamp: chrono::Local::now().to_rfc3339(),
                                });
                            }
                            Ok(None) => break,
                            Err(_) => break,
                        }
                    }
                    line = stderr_reader.next_line() => {
                        match line {
                            Ok(Some(text)) => {
                                let _ = ah.emit("process-output", StreamMessage {
                                    process_id: pid.clone(),
                                    project_name: pname.clone(),
                                    config_name: cname.clone(),
                                    output_type: "stderr".to_string(),
                                    content: text,
                                    timestamp: chrono::Local::now().to_rfc3339(),
                                });
                            }
                            Ok(None) => break,
                            Err(_) => break,
                        }
                    }
                }
            }

            // Wait for exit
            let exit_code = child.wait().await.ok().and_then(|s| s.code());
            let exit_type = match exit_code {
                Some(0) => "info",
                Some(_) => "error",
                None => "error",
            };

            let _ = ah.emit("process-output", StreamMessage {
                process_id: pid.clone(),
                project_name: pname.clone(),
                config_name: cname.clone(),
                output_type: exit_type.to_string(),
                content: format!("■ Process exited with code: {}", exit_code.map(|c| c.to_string()).unwrap_or("unknown".to_string())),
                timestamp: chrono::Local::now().to_rfc3339(),
            });

            let _ = ah.emit("process-exit", serde_json::json!({
                "process_id": pid,
                "exit_code": exit_code,
            }));

            // Update status
            {
                let mut info_map = process_info_ref.lock().await;
                if let Some(info) = info_map.get_mut(&pid) {
                    info.status = "stopped".to_string();
                }
            }

            // Remove from active
            {
                let mut active = active_ref.lock().await;
                active.remove(&pid);
            }
        });

        // Store handle
        {
            let mut active = self.active_processes.lock().await;
            active.insert(process_id.clone(), handle);
        }

        Ok(info)
    }

    pub async fn stop(&self, process_id: &str, app_handle: &AppHandle) -> Result<(), String> {
        // Abort the task
        {
            let mut active = self.active_processes.lock().await;
            if let Some(handle) = active.remove(process_id) {
                handle.abort();
            }
        }

        // Update status
        {
            let mut info_map = self.process_info.lock().await;
            if let Some(info) = info_map.get_mut(process_id) {
                info.status = "stopped".to_string();
            }
        }

        let _ = app_handle.emit("process-output", StreamMessage {
            process_id: process_id.to_string(),
            project_name: String::new(),
            config_name: String::new(),
            output_type: "info".to_string(),
            content: "■ Process stopped by user".to_string(),
            timestamp: chrono::Local::now().to_rfc3339(),
        });

        let _ = app_handle.emit("process-exit", serde_json::json!({
            "process_id": process_id,
            "exit_code": null,
        }));

        Ok(())
    }

    pub async fn get_active_processes(&self) -> Vec<ProcessInfo> {
        let info_map = self.process_info.lock().await;
        let active = self.active_processes.lock().await;
        info_map.values()
            .filter(|p| active.contains_key(&p.id) && p.status == "running")
            .cloned()
            .collect()
    }
}

// ─── Tauri Commands ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExecutionResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

#[command]
pub async fn spawn_project_command(
    app_handle: AppHandle,
    state: tauri::State<'_, crate::AppState>,
    project_id: String,
    config_name: String,
) -> Result<ProcessInfo, String> {
    let (project_name, final_command, working_dir, env_vars) = {
        let projects = state.projects.lock().await;
        let project = projects.get(&project_id).ok_or("Project not found")?;
        let config = project.configurations.iter()
            .find(|c| c.name == config_name)
            .ok_or("Config not found")?;

        let cmd = build_command_with_paths(config, project).await?;
        // Use project root if working_dir is empty or doesn't exist
        let wd = if config.working_dir.as_os_str().is_empty() || !config.working_dir.exists() {
            project.path.clone()
        } else {
            config.working_dir.clone()
        };
        (
            project.name.clone(),
            cmd,
            wd,
            config.env_vars.clone(),
        )
    };

    let process_id = Uuid::new_v4().to_string();

    state.process_manager.spawn_streaming(
        app_handle,
        process_id,
        project_id,
        project_name,
        config_name,
        final_command,
        working_dir,
        env_vars,
    ).await
}

#[command]
pub async fn stop_process(
    app_handle: AppHandle,
    state: tauri::State<'_, crate::AppState>,
    process_id: String,
) -> Result<(), String> {
    state.process_manager.stop(&process_id, &app_handle).await
}

#[command]
pub async fn get_active_processes(
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<ProcessInfo>, String> {
    Ok(state.process_manager.get_active_processes().await)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async fn build_command_with_paths(
    config: &crate::models::project::ProjectConfig,
    _project: &crate::models::project::Project,
) -> Result<String, String> {
    let mut command = config.command.clone();

    if let Some(java_home) = &config.custom_paths.java_home {
        command = format!("$env:JAVA_HOME='{}'; {}", java_home, command);
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
