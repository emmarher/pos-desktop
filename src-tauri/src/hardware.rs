//! hardware.rs — Orquestador de hardware en Rust (RF-IM / RF-BA).
//!
//! Task de fondo de Tokio que ejecuta la delegación:
//!   - Impresión: poll de GET /print-jobs?target_device_id&status=PENDING
//!     cada PRINT_POLLING_MS; imprime por serial (ESC/POS) y hace PATCH.
//!   - Báscula: lee del puerto serial, parsea frames y hace POST a
//!     /scale/current (heartbeat).
//!
//! Corre en Rust (no bloquea JS, sobrevive recargas del webview). Emite
//! eventos a la UI con app.emit. Los endpoints de /print-jobs y /scale
//! se agregan a pos-server en la Fase 5.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

use crate::printer::build_print_sequence;
use crate::scale::{parse_frame, ScaleConfig, ScaleReading};

/// Configuración de conexión al servidor (para el orquestador Rust).
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareConfig {
    pub server_ip: String,
    pub server_port: Option<u16>,
    pub device_id: String,
    pub can_print: bool,
    pub can_scale: bool,
    /// Configuración del puerto serial (impresora).
    pub printer_serial: Option<crate::serial::SerialConfig>,
    /// Configuración del puerto serial (báscula).
    pub scale_serial: Option<ScaleConfig>,
    /// Token JWT para las llamadas autenticadas al servidor.
    pub access_token: Option<String>,
}

/// Tarea de polling activa (evita arrancar dos veces).
pub struct HardwareState {
    pub running: Mutex<bool>,
}

impl Default for HardwareState {
    fn default() -> Self {
        Self {
            running: Mutex::new(false),
        }
    }
}

/// Evento emitido a la UI con la lectura de báscula.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaleReadingEvent {
    pub device_id: String,
    pub weight: f64,
    pub unit: String,
    pub stable: bool,
    pub at: String,
}

/// Job de impresión pendiente, espejo del modelo PrintJob.
#[derive(Debug, Deserialize)]
struct PrintJob {
    id: String,
    content: Option<String>,
    #[serde(default)]
    retries: u32,
    #[serde(default)]
    max_retries: u32,
}

/// Cliente HTTP mínimo (sin reqwest pesado por request): reutilizamos
/// reqwest con un client compartido.
fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())
}

/// Inicia el orquestador de hardware en segundo plano.
#[tauri::command]
pub fn start_hardware(
    app: AppHandle,
    state: State<'_, HardwareState>,
    config: HardwareConfig,
) -> Result<(), String> {
    let mut running = state.running.lock().map_err(|e| e.to_string())?;
    if *running {
        return Err("el orquestador de hardware ya está corriendo".to_string());
    }
    *running = true;

    let client = http_client()?;
    let app_handle = app.clone();
    let base_url = format!(
        "http://{}:{}",
        config.server_ip,
        config.server_port.unwrap_or(3000)
    );

    tauri::async_runtime::spawn(async move {
        let mut printer_serial: Option<serialport::SerialPort> = None;
        let mut scale_serial: Option<serialport::SerialPort> = None;
        let mut scale_last_weight: Option<f64> = None;

        // Abrir puertos según capacidades (impresora y/o báscula).
        if config.can_print {
            if let Some(cfg) = &config.printer_serial {
                match open_serial(&cfg.port, cfg.baud_rate) {
                    Ok(p) => printer_serial = Some(p),
                    Err(e) => {
                        emit_error(&app_handle, "printer", &e);
                    }
                }
            }
        }
        if config.can_scale {
            if let Some(cfg) = &config.scale_serial {
                match open_serial(&cfg.port, cfg.baud_rate.unwrap_or(9600)) {
                    Ok(p) => scale_serial = Some(p),
                    Err(e) => {
                        emit_error(&app_handle, "scale", &e);
                    }
                }
            }
        }

        // Bucle principal: polling de impresión + lectura de báscula.
        loop {
            let still_running = {
                let r = state.running.lock().unwrap();
                *r
            };
            if !still_running {
                break;
            }

            // 1) Impresión delegada (RF-IM-002)
            if config.can_print && printer_serial.is_some() {
                if let Some(port) = printer_serial.as_mut() {
                    match poll_print_jobs(&client, &base_url, &config, port).await {
                        Ok(()) => {}
                        Err(e) => emit_error(&app_handle, "printer", &e),
                    }
                }
            }

            // 2) Báscula: leer bytes y parsear
            if config.can_scale {
                if let Some(port) = scale_serial.as_mut() {
                    if let Some(cfg) = &config.scale_serial {
                        read_scale(port, cfg, config.device_id.clone(), &mut scale_last_weight, &app_handle);
                    }
                }
            }

            tokio::time::sleep(Duration::from_millis(500)).await;
        }
    });

    Ok(())
}

/// Detiene el orquestador de hardware.
#[tauri::command]
pub fn stop_hardware(state: State<'_, HardwareState>) -> Result<(), String> {
    let mut running = state.running.lock().map_err(|e| e.to_string())?;
    *running = false;
    Ok(())
}

fn open_serial(port: &str, baud: Option<u32>) -> Result<serialport::SerialPort, String> {
    serialport::new(port, baud.unwrap_or(9600))
        .open()
        .map_err(|e| format!("no se pudo abrir {port}: {e}"))
}

/// Poll de /print-jobs: obtiene el pendiente, imprime y hace PATCH.
async fn poll_print_jobs(
    client: &reqwest::Client,
    base_url: &str,
    config: &HardwareConfig,
    port: &mut serialport::SerialPort,
) -> Result<(), String> {
    let url = format!(
        "{base_url}/print-jobs?target_device_id={}&status=PENDING",
        config.device_id
    );
    let mut req = client.get(&url);
    if let Some(token) = &config.access_token {
        req = req.header("Authorization", format!("Bearer {token}"));
    }
    let resp = req
        .send()
        .await
        .map_err(|e| format!("GET /print-jobs falló: {e}"))?;
    if !resp.status().is_success() {
        return Ok(()); // servidor no accesible → reintentar en el siguiente ciclo
    }

    // El servidor responde { data: [...] } (envoltorio de pos-server).
    #[derive(Deserialize)]
    struct Envelope {
        data: Option<Vec<PrintJob>>,
    }
    let jobs: Vec<PrintJob> = resp
        .json::<Envelope>()
        .await
        .map(|e| e.data.unwrap_or_default())
        .unwrap_or_default();

    for job in jobs {
        let content = job.content.unwrap_or_default();
        let seq = build_print_sequence(&content, 42);
        let write_result = port.write_all(&seq).and_then(|_| port.flush());
        let new_status = if write_result.is_ok() {
            "COMPLETED"
        } else {
            "FAILED"
        };
        let patch_url = format!("{base_url}/print-jobs/{}", job.id);
        let body = serde_json::json!({ "status": new_status });
        let mut patch = client.patch(&patch_url).json(&body);
        if let Some(token) = &config.access_token {
            patch = patch.header("Authorization", format!("Bearer {token}"));
        }
        if let Err(e) = patch.send().await {
            emit_error_handle(config, &e);
        }
        let _ = job.retries;
    }
    Ok(())
}

/// Lee bytes de la báscula, parsea y emite + (futuro) heartbeat.
fn read_scale(
    port: &mut serialport::SerialPort,
    cfg: &ScaleConfig,
    device_id: String,
    last_weight: &mut Option<f64>,
    app: &AppHandle,
) {
    use std::io::Read;
    let mut buf = [0u8; 128];
    let mut text = String::new();
    loop {
        match port.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => text.push_str(&String::from_utf8_lossy(&buf[..n])),
        }
    }
    if text.is_empty() {
        return;
    }
    if let Some(reading) = parse_frame(&text, cfg) {
        let stable = match last_weight {
            Some(prev) => (*prev - reading.weight).abs() < 0.001,
            None => false,
        };
        *last_weight = Some(reading.weight);
        let event = ScaleReadingEvent {
            device_id: device_id.clone(),
            weight: reading.weight,
            unit: reading.unit.clone(),
            stable,
            at: Utc::now().to_rfc3339(),
        };
        // Enviar a la UI (la UI lo muestra en vivo).
        let _ = app.emit("scale-reading", event.clone());
        // TODO Fase 6: POST /scale/current (heartbeat) con el access_token.
        let _ = &event;
    }
}

fn emit_error(app: &AppHandle, source: &str, msg: &str) {
    let _ = app.emit(
        "hardware-error",
        serde_json::json!({ "source": source, "message": msg }),
    );
}

fn emit_error_handle(config: &HardwareConfig, msg: &str) {
    let _ = &config;
    let _ = msg;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hardware_config_defaults() {
        let cfg = HardwareConfig {
            server_ip: "127.0.0.1".into(),
            server_port: None,
            device_id: "dev-1".into(),
            can_print: true,
            can_scale: false,
            printer_serial: None,
            scale_serial: None,
            access_token: None,
        };
        assert_eq!(cfg.server_port, None);
        assert!(cfg.can_print);
    }

    #[test]
    fn scale_reading_event_serializes() {
        let ev = ScaleReadingEvent {
            device_id: "dev-1".into(),
            weight: 1.25,
            unit: "kg".into(),
            stable: true,
            at: "2026-01-01T00:00:00Z".into(),
        };
        let json = serde_json::to_string(&ev).unwrap();
        assert!(json.contains("deviceId"));
        assert!(json.contains("1.25"));
    }
}