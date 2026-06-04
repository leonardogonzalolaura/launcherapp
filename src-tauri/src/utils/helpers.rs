use std::path::Path;
use std::process::Command;
use regex::Regex;

pub fn validate_path(path: &str) -> bool {
    Path::new(path).exists()
}

pub fn get_file_extension(filename: &str) -> Option<String> {
    Path::new(filename)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_string())
}

pub fn sanitize_command(command: &str) -> String {
    // Eliminar caracteres peligrosos
    let re = Regex::new(r"[&|;`$]").unwrap();
    re.replace_all(command, "").to_string()
}

pub fn format_duration(seconds: u64) -> String {
    let hours = seconds / 3600;
    let minutes = (seconds % 3600) / 60;
    let secs = seconds % 60;
    
    if hours > 0 {
        format!("{}h {}m {}s", hours, minutes, secs)
    } else if minutes > 0 {
        format!("{}m {}s", minutes, secs)
    } else {
        format!("{}s", secs)
    }
}

pub fn get_python_version() -> Option<String> {
    let output = Command::new("python")
        .arg("--version")
        .output()
        .ok()?;
    
    let version_str = String::from_utf8_lossy(&output.stdout);
    let version_re = Regex::new(r"Python (\d+\.\d+\.\d+)").unwrap();
    version_re.captures(&version_str)
        .and_then(|cap| cap.get(1).map(|m| m.as_str().to_string()))
}