//! api.rs — Cliente HTTP del POS en Rust (RF-AU, RF-CA, RF-VE…).
//!
//! Todas las peticiones HTTP al backend `pos-server` salen de AQUÍ (Rust),
//! NO del webview. El token de sesión y la IP/puerto del servidor viven en
//! el estado de Rust, así el JWT no circula por el DOM del frontend.
//!
//! Comandos Tauri expuestos:
//!   - api_set_server(ip, port)     → fija el servidor descubierto
//!   - api_set_token(token)         → guarda el access token (en memoria)
//!   - api_request(path, method, body) → ejecuta la petición

use std::sync::Mutex;
use tauri::State;

/// Estado del cliente HTTP (servidor + token), compartido entre comandos.
#[derive(Default)]
pub struct ApiState {
    pub server_ip: Mutex<Option<String>>,
    pub server_port: Mutex<Option<u16>>,
    pub access_token: Mutex<Option<String>>,
}

/// Payload del comando api_request.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiRequestInput {
    pub path: String,
    #[serde(default = "default_method")]
    pub method: String,
    /// Cuerpo JSON opcional (stringify'd por el front).
    pub body: Option<serde_json::Value>,
    /// false → no envía Authorization (login/refresh).
    #[serde(default = "default_true")]
    pub auth: bool,
}

fn default_method() -> String {
    "GET".to_string()
}
fn default_true() -> bool {
    true
}

/// Fija el servidor con el que el cliente Rust hará las peticiones.
#[tauri::command]
pub fn api_set_server(
    state: State<'_, ApiState>,
    ip: String,
    port: u16,
) -> Result<(), String> {
    *state.server_ip.lock().map_err(|e| e.to_string())? = Some(ip);
    *state.server_port.lock().map_err(|e| e.to_string())? = Some(port);
    Ok(())
}

/// Guarda el access token en memoria de Rust (no se expone al webview).
#[tauri::command]
pub fn api_set_token(state: State<'_, ApiState>, token: Option<String>) -> Result<(), String> {
    *state.access_token.lock().map_err(|e| e.to_string())? = token;
    Ok(())
}

/// Ejecuta una petición HTTP al backend pos-server.
///
/// Retorna el `data` del envoltorio `{statusCode, message, data}` ya
/// desempaquetado (espejo de los helpers okEnvelope/errorEnvelope del
/// backend). Los errores de red/HTTP se devuelven como `Err(String)` con
/// un mensaje legible.
#[tauri::command]
pub async fn api_request(
    state: State<'_, ApiState>,
    input: ApiRequestInput,
) -> Result<serde_json::Value, String> {
    let ip = state
        .server_ip
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "Servidor no configurado".to_string())?;
    let port = state
        .server_port
        .lock()
        .map_err(|e| e.to_string())?
        .unwrap_or(3000);

    let url = format!("http://{ip}:{port}{}", input.path);
    let method = input.method.to_uppercase();

    let client = reqwest::Client::new();
    let mut req = client
        .request(
            match method.as_str() {
                "POST" => reqwest::Method::POST,
                "PATCH" => reqwest::Method::PATCH,
                "DELETE" => reqwest::Method::DELETE,
                "PUT" => reqwest::Method::PUT,
                _ => reqwest::Method::GET,
            },
            &url,
        )
        .header("Content-Type", "application/json");

    // Token de sesión desde Rust (si auth=true).
    if input.auth {
        let token = state.access_token.lock().map_err(|e| e.to_string())?.clone();
        if let Some(t) = token {
            req = req.header("Authorization", format!("Bearer {t}"));
        }
    }

    if let Some(body) = input.body {
        req = req.json(&body);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("No se pudo conectar con el servidor: {e}"))?;

    // 401 → el front reintenta con refresh (por ahora se propaga).
    let status = resp.status().as_u16();
    if status == 204 {
        return Ok(serde_json::Value::Null);
    }

    let text = resp.text().await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&text).unwrap_or_else(|_| {
        serde_json::Value::String(text)
    });

    // Desempaquetar el envoltorio { statusCode, message, data }.
    if let Some(obj) = json.as_object() {
        let code = obj.get("statusCode").and_then(|v| v.as_u64()).unwrap_or(status as u64);
        // Error del servidor (4xx/5xx con data: []) → convertirlo a Err.
        // El mensaje lleva el prefijo "[código] " para que el front pueda
        // distinguir un 401 (sesión muerta) de un fallo real de red.
        if code >= 400 {
            let msg = obj
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("Error del servidor")
                .to_string();
            return Err(format!("[{code}] {msg}"));
        }
        if let Some(data) = obj.get("data") {
            return Ok(data.clone());
        }
    }

    Ok(json)
}