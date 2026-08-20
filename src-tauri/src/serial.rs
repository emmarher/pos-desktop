//! serial.rs — Capa serial genérica (RF-IM / RF-BA).
//!
//! Expone comandos Tauri para listar puertos, abrir/cerrar, escribir y
//! leer bytes. El parsing de impresora (ESC/POS) y báscula vive en
//! printer.rs y scale.rs respectivamente. Diseñada de forma genérica y
//! configurable (puerto + baud) porque aún no hay equipos reales.

use serde::Serialize;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::State;

/// Configuración de un puerto serial (parámetros genéricos).
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SerialConfig {
    pub port: String,
    pub baud_rate: Option<u32>,
    pub data_bits: Option<u8>,
    pub stop_bits: Option<u8>,
    pub parity: Option<String>,
}

/// Descripción de un puerto disponible.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SerialPortInfo {
    pub port_name: String,
    pub description: Option<String>,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
}

/// Estado del puerto serial abierto (compartido entre comandos).
pub struct SerialState {
    pub port: Mutex<Option<serialport::SerialPort>>,
}

impl Default for SerialState {
    fn default() -> Self {
        Self {
            port: Mutex::new(None),
        }
    }
}

/// Lista los puertos serial disponibles en el sistema.
#[tauri::command]
pub fn list_ports() -> Result<Vec<SerialPortInfo>, String> {
    let ports = serialport::available_ports().map_err(|e| format!("{e}"))?;
    Ok(ports
        .into_iter()
        .map(|p| {
            let info = match &p.port_type {
                serialport::SerialPortType::UsbPort(usb) => Some((
                    usb.description.clone(),
                    usb.manufacturer.clone(),
                    usb.product.clone(),
                )),
                serialport::SerialPortType::PciPort => None,
                serialport::SerialPortType::BluetoothPort => None,
                serialport::SerialPortType::Unknown => None,
            };
            SerialPortInfo {
                port_name: p.port_name,
                description: info.as_ref().and_then(|i| i.0.clone()),
                manufacturer: info.as_ref().and_then(|i| i.1.clone()),
                product: info.as_ref().and_then(|i| i.2.clone()),
            }
        })
        .collect())
}

/// Abre un puerto serial con la configuración dada.
#[tauri::command]
pub fn open_port(state: State<'_, SerialState>, config: SerialConfig) -> Result<(), String> {
    let mut guard = state.port.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Err("ya hay un puerto serial abierto".to_string());
    }
    let builder = serialport::new(&config.port, config.baud_rate.unwrap_or(9600));
    let builder = match config.data_bits {
        Some(7) => builder.data_bits(serialport::DataBits::Seven),
        _ => builder.data_bits(serialport::DataBits::Eight),
    };
    let builder = match config.stop_bits {
        Some(1) => builder.stop_bits(serialport::StopBits::One),
        Some(2) => builder.stop_bits(serialport::StopBits::Two),
        _ => builder.stop_bits(serialport::StopBits::One),
    };
    let builder = match config.parity.as_deref() {
        Some("even") => builder.parity(serialport::Parity::Even),
        Some("odd") => builder.parity(serialport::Parity::Odd),
        _ => builder.parity(serialport::Parity::None),
    };
    let port = builder
        .open()
        .map_err(|e| format!("no se pudo abrir {0}: {e}", config.port))?;
    *guard = Some(port);
    Ok(())
}

/// Cierra el puerto serial si estaba abierto.
#[tauri::command]
pub fn close_port(state: State<'_, SerialState>) -> Result<(), String> {
    let mut guard = state.port.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}

/// Escribe bytes (base64) al puerto serial. Devuelve cuántos se escribieron.
#[tauri::command]
pub fn write_port(state: State<'_, SerialState>, data_base64: String) -> Result<usize, String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64)
        .map_err(|e| format!("base64 inválido: {e}"))?;
    let mut guard = state.port.lock().map_err(|e| e.to_string())?;
    let port = guard.as_mut().ok_or("no hay puerto serial abierto")?;
    port.write_all(&bytes)
        .map_err(|e| format!("error de escritura serial: {e}"))?;
    port.flush().map_err(|e| format!("error de flush: {e}"))?;
    Ok(bytes.len())
}

/// Lee todos los bytes disponibles (sin bloquear). Devuelve base64.
#[tauri::command]
pub fn read_port(state: State<'_, SerialState>) -> Result<String, String> {
    use base64::Engine as _;
    let mut guard = state.port.lock().map_err(|e| e.to_string())?;
    let port = guard.as_mut().ok_or("no hay puerto serial abierto")?;
    let mut buf = [0u8; 4096];
    let mut acc = Vec::new();
    loop {
        match port.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => acc.extend_from_slice(&buf[..n]),
        }
    }
    Ok(base64::engine::general_purpose::STANDARD.encode(acc))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serial_config_defaults() {
        let cfg = SerialConfig {
            port: "COM1".into(),
            baud_rate: None,
            data_bits: None,
            stop_bits: None,
            parity: None,
        };
        assert_eq!(cfg.port, "COM1");
        assert_eq!(cfg.baud_rate, None);
    }
}