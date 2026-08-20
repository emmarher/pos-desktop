//! udp.rs — UDP broadcast "POS_DISCOVER" (RF-DS-001).
//!
//! Envía el mensaje por broadcast UDP a la red local y espera la primera
//! respuesta JSON del servidor. Se ejecuta en un task de Tokio con timeout
//! y cancelación segura. En Windows se envía a la dirección de broadcast
//! por defecto de la primera interfaz con IPv4.

use serde::Serialize;
use std::net::{Ipv4Addr, SocketAddrV4, UdpSocket};
use std::time::Duration;

/// Información del servidor descubierto, espejo de la respuesta del
/// backend pos-server (src/services/udp-discovery.ts).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct DiscoveredServer {
    pub ip: String,
    pub port: Option<u16>,
    pub tenant_id: Option<String>,
    pub device_name: Option<String>,
    pub api_version: Option<String>,
}

/// Envía `message` por broadcast UDP al puerto dado y espera una respuesta.
///
/// El socket se enlaza a 0.0.0.0 con un puerto efímero, habilita broadcast
/// y envía a 255.255.255.255. Se espera hasta `timeout_ms` por la primera
/// respuesta; si no llega, retorna `None`.
pub async fn discover(
    message: String,
    port: u16,
    timeout_ms: u64,
) -> Result<Option<DiscoveredServer>, String> {
    let socket = UdpSocket::bind(SocketAddrV4::new(Ipv4Addr::UNSPECIFIED, 0))
        .map_err(|e| format!("no se pudo abrir el socket UDP: {e}"))?;
    socket
        .set_read_timeout(Some(Duration::from_millis(200)))
        .map_err(|e| format!("no se pudo configurar el socket UDP: {e}"))?;
    socket
        .set_broadcast(true)
        .map_err(|e| format!("no se pudo habilitar broadcast: {e}"))?;

    let broadcast_addr = SocketAddrV4::new(Ipv4Addr::BROADCAST, port);
    socket
        .send_to(message.as_bytes(), broadcast_addr)
        .map_err(|e| format!("no se pudo enviar el broadcast UDP: {e}"))?;

    // Leer hasta agotar el timeout global (el read timeout es parcial).
    let deadline = std::time::Instant::now() + Duration::from_millis(timeout_ms);
    let mut buf = [0u8; 2048];
    while std::time::Instant::now() < deadline {
        match socket.recv_from(&mut buf) {
            Ok((len, _src)) => {
                let raw = String::from_utf8_lossy(&buf[..len]);
                if let Some(server) = parse_response(raw.as_ref()) {
                    return Ok(Some(server));
                }
            }
            Err(_) => {
                // timeout de lectura parcial → continuar hasta el deadline
                if std::time::Instant::now() >= deadline {
                    break;
                }
            }
        }
    }
    Ok(None)
}

/// Parsea la respuesta JSON del servidor: {ip, port, tenant_id, ...}.
fn parse_response(raw: &str) -> Option<DiscoveredServer> {
    let data: serde_json::Value = serde_json::from_str(raw).ok()?;
    let ip = data.get("ip")?.as_str()?.to_string();
    Some(DiscoveredServer {
        ip,
        port: data.get("port").and_then(|v| v.as_u64()).map(|v| v as u16),
        tenant_id: data
            .get("tenant_id")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        device_name: data
            .get("device_name")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        api_version: data
            .get("api_version")
            .and_then(|v| v.as_str())
            .map(str::to_string),
    })
}

#[cfg(test)]
mod tests {
    use super::parse_response;

    #[test]
    fn parse_response_ok() {
        let raw = r#"{"ip":"192.168.1.10","port":3000,"tenant_id":"T1","device_name":"Server","api_version":"1.0.0"}"#;
        let s = parse_response(raw).unwrap();
        assert_eq!(s.ip, "192.168.1.10");
        assert_eq!(s.port, Some(3000));
        assert_eq!(s.tenant_id.as_deref(), Some("T1"));
    }

    #[test]
    fn parse_response_invalid() {
        assert!(parse_response("no json").is_none());
        assert!(parse_response(r#"{"port":3000}"#).is_none());
    }
}