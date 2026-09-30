pub mod process;
pub mod project;
pub mod detection;
pub mod search;

// Re-exportar comandos para fácil acceso
pub use process::*;
pub use project::*;
pub use detection::*;
pub use search::*;