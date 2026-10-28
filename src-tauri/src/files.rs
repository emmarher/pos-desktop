//! files.rs — Escritura de archivos desde el webview sin exponer el fs.
//!
//! El frontend genera el ticket (PNG/PDF) y lo envía en base64; Rust lo
//! escribe en la ruta elegida con el diálogo nativo.

use base64::{engine::general_purpose::STANDARD, Engine as _};

/// Guarda `data_base64` en `path` (ruta absoluta elegida por el usuario).
#[tauri::command]
pub fn save_file_base64(path: String, data_base64: String) -> Result<(), String> {
    let bytes = STANDARD
        .decode(data_base64)
        .map_err(|e| format!("base64 inválido: {e}"))?;
    std::fs::write(&path, bytes).map_err(|e| format!("no se pudo escribir {path}: {e}"))
}
