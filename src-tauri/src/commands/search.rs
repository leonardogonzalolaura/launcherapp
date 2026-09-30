use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::command;
use walkdir::WalkDir;

const EXCLUDED_DIRS: &[&str] = &[
    "node_modules", ".git", "target", "__pycache__", ".venv", "venv", "dist", "build",
    ".next", ".idea", ".vscode",
];

const MAX_FILE_SIZE: u64 = 1024 * 1024; // 1MB
const MAX_FILE_MATCHES: usize = 50;
const MAX_CONTENT_MATCHES: usize = 200;
const SNIPPET_LEN: usize = 160;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMatch {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentMatch {
    pub name: String,
    pub path: String,
    pub line: u32,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResponse {
    pub files: Vec<FileMatch>,
    pub contents: Vec<ContentMatch>,
}

fn is_excluded(path: &std::path::Path) -> bool {
    path.components().any(|c| {
        let s = c.as_os_str().to_string_lossy();
        EXCLUDED_DIRS.iter().any(|e| s == *e) || (s.starts_with('.') && s.len() > 1 && !s.contains('.'))
    })
}

fn truncate(s: &str) -> String {
    if s.len() <= SNIPPET_LEN {
        return s.to_string();
    }
    // cut on char boundary
    let mut end = SNIPPET_LEN;
    while !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &s[..end])
}

/// Búsqueda unificada insensible a mayúsculas por nombre y contenido.
/// Una sola pasada WalkDir: primero match por nombre, si no coincide busca dentro.
#[command]
pub async fn search_files(root: String, term: String) -> Result<SearchResponse, String> {
    let term_trimmed = term.trim();
    if term_trimmed.len() < 2 {
        return Ok(SearchResponse { files: vec![], contents: vec![] });
    }
    let needle = term_trimmed.to_lowercase();
    let root_path = PathBuf::from(&root);
    if !root_path.exists() {
        return Err("Root path does not exist".to_string());
    }

    // spawn_blocking para no bloquear el runtime async
    tokio::task::spawn_blocking(move || {
        let mut files: Vec<FileMatch> = Vec::new();
        let mut contents: Vec<ContentMatch> = Vec::new();

        let walker = WalkDir::new(&root_path)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();
                // excluir dirs de la lista; permitir archivos ocultos tipo .env pero no dirs ocultos
                if e.file_type().is_dir() {
                    if EXCLUDED_DIRS.contains(&name.as_ref()) {
                        return false;
                    }
                    if name.starts_with('.') {
                        return false;
                    }
                }
                true
            });

        for entry in walker.filter_map(|e| e.ok()) {
            if files.len() >= MAX_FILE_MATCHES && contents.len() >= MAX_CONTENT_MATCHES {
                break;
            }
            let path = entry.path();
            if !entry.file_type().is_file() {
                continue;
            }
            if is_excluded(path) {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            let path_str = path.to_string_lossy().to_string();

            // 1) match por nombre (insensible)
            if files.len() < MAX_FILE_MATCHES && name.to_lowercase().contains(&needle) {
                files.push(FileMatch { name, path: path_str });
                continue; // si ya matchea por nombre no hace falta buscar dentro
            }

            // 2) match por contenido
            if contents.len() >= MAX_CONTENT_MATCHES {
                continue;
            }
            // tamaño
            if let Ok(meta) = entry.metadata() {
                if meta.len() > MAX_FILE_SIZE {
                    continue;
                }
            }
            let Ok(content) = std::fs::read(path) else { continue };
            // binario: NUL en primeros 1KB
            let head = &content[..content.len().min(1024)];
            if head.contains(&0) {
                continue;
            }
            let Ok(text) = String::from_utf8(content) else { continue };
            for (idx, line) in text.lines().enumerate() {
                if line.to_lowercase().contains(&needle) {
                    contents.push(ContentMatch {
                        name: name.clone(),
                        path: path_str.clone(),
                        line: (idx + 1) as u32,
                        snippet: truncate(line.trim()),
                    });
                    break; // una coincidencia por archivo para no inundar
                }
                if contents.len() >= MAX_CONTENT_MATCHES {
                    break;
                }
            }
        }

        files.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(SearchResponse { files, contents })
    })
    .await
    .map_err(|e| e.to_string())?
}
