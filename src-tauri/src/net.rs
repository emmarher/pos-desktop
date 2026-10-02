//! net.rs — utilidades de red local para el discovery (barrido /24).
//!
//! Último recurso de descubrimiento cuando ni el almacenado, ni mDNS, ni el
//! broadcast UDP, ni 127.0.0.1 encuentran el servidor: se huele el segmento
//! /24 de la interfaz local y se prueban las 254 direcciones.
//!
//! Es "ruidoso" a propósito y por eso lo dispara el usuario desde la UI
//! ("búsqueda profunda"), no el flujo automático.

use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream, UdpSocket};
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// Nº de hilos paralelos del barrido (acotado para no saturar la red/host).
const SWEEP_WORKERS: u8 = 32;

/// Devuelve el prefijo /24 de la interfaz local usada para salir a la red.
///
/// Técnica del socket UDP "conectado": no envía tráfico, solo resuelve la
/// ruta que usaría el SO y expone la IP local elegida. Sin crates extra.
pub fn local_subnet() -> Option<String> {
    let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).ok()?;
    // 8.8.8.8 no se contacta (UDP es sin conexión): fuerza la elección de ruta.
    socket.connect((Ipv4Addr::new(8, 8, 8, 8), 53)).ok()?;
    let ip = match socket.local_addr().ok()?.ip() {
        IpAddr::V4(v4) => v4,
        IpAddr::V6(_) => return None,
    };
    if ip.is_loopback() || ip.is_unspecified() {
        return None;
    }
    let o = ip.octets();
    Some(format!("{}.{}.{}", o[0], o[1], o[2]))
}

/// Convierte "192.168.1" en sus tres octetos.
fn prefix_to_octets(prefix: &str) -> Option<[u8; 3]> {
    let parts: Vec<&str> = prefix.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    let mut o = [0u8; 3];
    for (i, p) in parts.iter().enumerate() {
        o[i] = p.parse::<u8>().ok()?;
    }
    Some(o)
}

/// Escanea `1..=254` del prefijo `/24` y devuelve las IPs con el puerto TCP
/// abierto (servidor escuchando). El orden no está garantizado.
pub fn sweep_subnet(prefix: &str, port: u16, timeout_ms: u64) -> Vec<String> {
    let base = match prefix_to_octets(prefix.trim()) {
        Some(b) => b,
        None => return Vec::new(),
    };
    let timeout = Duration::from_millis(timeout_ms.clamp(50, 2000));

    let queue = Arc::new(Mutex::new((1u8..=254).collect::<Vec<u8>>()));
    let results = Arc::new(Mutex::new(Vec::<String>::new()));

    let mut handles = Vec::with_capacity(SWEEP_WORKERS as usize);
    for _ in 0..SWEEP_WORKERS {
        let queue = Arc::clone(&queue);
        let results = Arc::clone(&results);
        handles.push(std::thread::spawn(move || loop {
            let host = match queue.lock().unwrap().pop() {
                Some(h) => h,
                None => break,
            };
            let ip = Ipv4Addr::new(base[0], base[1], base[2], host);
            let addr = SocketAddr::new(IpAddr::V4(ip), port);
            if TcpStream::connect_timeout(&addr, timeout).is_ok() {
                results.lock().unwrap().push(ip.to_string());
            }
        }));
    }
    for h in handles {
        let _ = h.join();
    }

    let mut out = results.lock().unwrap().clone();
    out.sort();
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefix_parsing() {
        assert_eq!(prefix_to_octets("192.168.1"), Some([192, 168, 1]));
        assert_eq!(prefix_to_octets("10.0.0"), Some([10, 0, 0]));
        assert_eq!(prefix_to_octets("192.168"), None);
        assert_eq!(prefix_to_octets("192.168.1.5"), None);
        assert_eq!(prefix_to_octets("a.b.c"), None);
    }

    #[test]
    fn sweep_bad_prefix_is_empty() {
        assert!(sweep_subnet("no-es-prefijo", 3000, 50).is_empty());
    }
}
