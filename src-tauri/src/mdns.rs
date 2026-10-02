//! mdns.rs — Descubrimiento del servidor por mDNS/DNS-SD (fallback de UDP).
//!
//! El servidor publica `_pos-server._tcp.local` (ver
//! pos-server/src/services/mdns-advertise.ts). Aquí se resuelve sin depender
//! del broadcast UDP (que algunas redes/AV filtran).
//!
//! `browse_mdns` junta la primera instancia resuelta dentro del timeout:
//! IP (del registro A del host) + puerto (SRV) + TXT (tenant_code, api_version).

use mdns_sd::{ServiceDaemon, ServiceEvent};
use serde::Serialize;
use std::time::Duration;

/// Servidor descubierto por mDNS, espejo de udp::DiscoveredServer.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct MdnsServer {
    pub ip: String,
    pub port: Option<u16>,
    pub tenant_id: Option<String>,
    pub device_name: Option<String>,
    pub api_version: Option<String>,
}

/// Resuelve `_pos-server._tcp.local` y retorna la primera instancia.
/// `timeout_ms`: espera máxima total (default 3000).
pub fn browse(service_type: &str, timeout_ms: u64) -> Result<Option<MdnsServer>, String> {
    let mdns = ServiceDaemon::new().map_err(|e| format!("mDNS no disponible: {e}"))?;
    let receiver = mdns
        .browse(service_type)
        .map_err(|e| format!("browse mDNS falló: {e}"))?;
    let deadline = std::time::Instant::now() + Duration::from_millis(timeout_ms.max(500));
    while std::time::Instant::now() < deadline {
        let remaining = deadline.saturating_duration_since(std::time::Instant::now());
        match receiver.recv_timeout(remaining) {
            Ok(ServiceEvent::ServiceResolved(info)) => {
                let ip = info
                    .get_addresses()
                    .iter()
                    .find(|a| a.is_ipv4())
                    .or_else(|| info.get_addresses().iter().next())
                    .map(|a| a.to_string());
                let ip = match ip {
                    Some(ip) => ip,
                    None => continue,
                };
                let props = info.get_properties();
                let txt = |k: &str| props.get(k).map(|v| v.val_str().to_string());
                // Detener el browse y apagar el daemon antes de retornar:
                // libera el socket multicast (si no, queda abierto entre intentos).
                let _ = mdns.stop_browse(service_type);
                let _ = mdns.shutdown();
                return Ok(Some(MdnsServer {
                    ip,
                    port: Some(info.get_port()),
                    tenant_id: txt("tenant_code"),
                    device_name: txt("device_name"),
                    api_version: txt("api_version"),
                }));
            }
            // Eventos de red (aparece/desaparece/needle): seguir esperando.
            Ok(_) => continue,
            Err(_) => break, // timeout del canal → deadline
        }
    }
    let _ = mdns.stop_browse(service_type);
    // Apagar el daemon cierra sockets multicast (sin fugas entre intentos).
    mdns.shutdown().map_err(|e| format!("shutdown mDNS falló: {e}"))?;
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mdns_server_serializes_like_udp() {
        let s = MdnsServer {
            ip: "192.168.1.10".into(),
            port: Some(3000),
            tenant_id: Some("T1".into()),
            device_name: None,
            api_version: Some("0.2.2".into()),
        };
        let json = serde_json::to_string(&s).unwrap();
        assert!(json.contains("192.168.1.10"));
        assert!(json.contains("tenant_id"));
    }
}
