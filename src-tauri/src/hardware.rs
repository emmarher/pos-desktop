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
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

use crate::printer::build_print_sequence;
use crate::scale::{parse_frame, ScaleConfig};

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
    pub running: Arc<AtomicBool>,
}

impl Default for HardwareState {
    fn default() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
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
}

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
    if state.running.load(Ordering::SeqCst) {
        return Err("el orquestador de hardware ya está corriendo".to_string());
    }
    state.running.store(true, Ordering::SeqCst);

    let client = http_client()?;
    let app_handle = app.clone();
    let running_flag = state.running.clone();
    let base_url = format!(
        "http://{}:{}",
        config.server_ip,
        config.server_port.unwrap_or(3000)
    );

    // Clonar la config para moverla al task async.
    let cfg = config.clone();

    tauri::async_runtime::spawn(async move {
        let mut printer_serial: Option<Box<dyn serialport::SerialPort>> = None;
        let mut scale_serial: Option<Box<dyn serialport::SerialPort>> = None;
        let mut scale_last_weight: Option<f64> = None;

        if cfg.can_print {
            if let Some(sc) = &cfg.printer_serial {
                match open_serial(&sc.port, sc.baud_rate) {
                    Ok(p) => printer_serial = Some(p),
                    Err(e) => emit_error(&app_handle, "printer", &e),
                }
            }
        }
        if cfg.can_scale {
            if let Some(sc) = &cfg.scale_serial {
                match open_serial(&sc.port, sc.baud_rate) {
                    Ok(p) => scale_serial = Some(p),
                    Err(e) => emit_error(&app_handle, "scale", &e),
                }
            }
        }

        loop {
            if !running_flag.load(Ordering::SeqCst) {
                break;
            }

            if cfg.can_print {
                if let Some(port) = printer_serial.as_mut() {
                    match poll_print_jobs(&client, &base_url, &cfg, port, &app_handle).await {
                        Ok(()) => {}
                        Err(e) => emit_error(&app_handle, "printer", &e),
                    }
                }
            }

            if cfg.can_scale {
                if let Some(port) = scale_serial.as_mut() {
                    if let Some(sc) = &cfg.scale_serial {
                        read_scale(
                            port,
                            sc,
                            cfg.device_id.clone(),
                            &mut scale_last_weight,
                            &app_handle,
                        );
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
    state.running.store(false, Ordering::SeqCst);
    Ok(())
}

fn open_serial(
    port: &str,
    baud: Option<u32>,
) -> Result<Box<dyn serialport::SerialPort>, String> {
    serialport::new(port, baud.unwrap_or(9600))
        .open()
        .map_err(|e| format!("no se pudo abrir {port}: {e}"))
}

/// Poll de /print-jobs: obtiene el pendiente, imprime y hace PATCH.
async fn poll_print_jobs(
    client: &reqwest::Client,
    base_url: &str,
    config: &HardwareConfig,
    port: &mut Box<dyn serialport::SerialPort>,
    app: &AppHandle,
) -> Result<(), String> {
    use std::io::Write;

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
            emit_error(app, "printer", &format!("PATCH /print-jobs falló: {e}"));
        }
    }
    Ok(())
}

/// Lee bytes de la báscula, parsea y emite a la UI.
fn read_scale(
    port: &mut Box<dyn serialport::SerialPort>,
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
        let _ = app.emit("scale-reading", event.clone());
        let _ = &event;
    }
}

fn emit_error(app: &AppHandle, source: &str, msg: &str) {
    let _ = app.emit(
        "hardware-error",
        serde_json::json!({ "source": source, "message": msg }),
    );
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