//! pos-desktop — backend Rust de la app POS desktop.
//!
//! Comandos Tauri expuestos al frontend:
//!   - udp_discover     → discovery del servidor (RF-DS-001)
//!   - api_set_server / api_set_token / api_request
//!                        → cliente HTTP del POS en Rust (seguridad:
//!                          el webview NUNCA hace fetch al backend)
//!   - list_ports / open_port / close_port / write_port / read_port
//!                        → capa serial genérica (RF-IM / RF-BA)
//!   - start_hardware / stop_hardware → orquestador de impresión + báscula
//!
//! Módulos:
//!   - api.rs     cliente HTTP (reqwest) con token en Rust
//!   - udp.rs     protocolo UDP de discovery
//!   - serial.rs  capa serial genérica
//!   - printer.rs builder ESC/POS
//!   - scale.rs   parser de báscula configurable
//!   - hardware.rs orquestador delegado (poll print-jobs + báscula)

mod api;
mod hardware;
mod printer;
mod printer_usb;
mod scale;
mod serial;
mod udp;

use std::sync::Mutex;

/// Estado global compartido entre comandos.
pub struct AppState {
    pub serial: serial::SerialState,
    pub hardware: hardware::HardwareState,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            serial: serial::SerialState::default(),
            hardware: hardware::HardwareState::default(),
        }
    }
}

/// Configuración persistida del hardware (puertos serial), para que el
/// orquestador pueda reabrir al arrancar. Por ahora vacío; la UI lo llena
/// al iniciar con la config del dispositivo (can_print/can_scale).
#[derive(Default)]
pub struct HardwareSettings {
    pub current: Mutex<Option<hardware::HardwareConfig>>,
}

/// Comando Tauri: discovery del servidor por UDP.
///
/// `message`: texto a enviar (POS_DISCOVER). `port`: puerto UDP (5000).
/// `timeoutMs`: tiempo de espera de respuesta (ms, default 3000).
#[tauri::command]
async fn udp_discover(
    message: String,
    port: u16,
    timeout_ms: Option<u64>,
) -> Result<Option<udp::DiscoveredServer>, String> {
    udp::discover(message, port, timeout_ms.unwrap_or(3000)).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::default())
        .manage(HardwareSettings::default())
        .manage(api::ApiState::default())
        .invoke_handler(tauri::generate_handler![
            udp_discover,
            api::api_set_server,
            api::api_set_token,
            api::api_request,
            api::api_upload_file,
            serial::list_ports,
            serial::open_port,
            serial::close_port,
            serial::write_port,
            serial::read_port,
            printer_usb::list_printers,
            printer_usb::print_raw_usb,
            printer_usb::print_test_usb,
            hardware::start_hardware,
            hardware::stop_hardware,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}