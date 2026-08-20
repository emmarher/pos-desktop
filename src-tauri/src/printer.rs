//! printer.rs — Builder ESC/POS para impresoras térmicas (RF-IM).
//!
//! Construye la secuencia de bytes a enviar por el puerto serial. El
//! contenido es texto plano (ticket) que llega del servidor vía
//! /print-jobs; aquí se agregan los comandos ESC/POS (inicialización,
//! alineación, feed y corte).

/// Códigos de control ESC/POS (EPOS).
const ESC: u8 = 0x1B;
const GS: u8 = 0x1D;

/// Construye la secuencia completa de impresión de un ticket.
///
/// `content` es el texto del ticket (puede incluir \n). Se imprime con
/// fuente estándar, alineación a la izquierda, feed final y corte.
pub fn build_print_sequence(content: &str, width: usize) -> Vec<u8> {
    let mut out = Vec::new();
    // Inicialización de la impresora
    out.extend_from_slice(&[ESC, b'@']);
    // Codificación normal (CP437 por defecto)
    out.extend_from_slice(&[ESC, b't', 0x00]);
    // Alineación izquierda
    out.extend_from_slice(&[ESC, b'a', 0x00]);

    for line in content.lines() {
        // Emitir la línea recortada al ancho configurado
        let mut l: &str = line;
        while l.chars().count() > width {
            let cut = l
                .char_indices()
                .nth(width)
                .map(|(i, _)| i)
                .unwrap_or(l.len());
            out.extend_from_slice(l[..cut].as_bytes());
            out.push(b'\n');
            l = &l[cut..];
        }
        out.extend_from_slice(l.as_bytes());
        out.push(b'\n');
    }

    // Feed de papel (3 líneas) y corte parcial
    out.extend_from_slice(&[ESC, b'd', 3]);
    out.extend_from_slice(&[GS, b'V', 66, 0]);
    out
}

/// Construye la secuencia de un código de barras CODE128.
pub fn build_barcode_sequence(data: &str) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(&[GS, b'h', 50]); // altura 50 dots
    out.extend_from_slice(&[GS, b'w', 2]); // ancho 2x
    out.extend_from_slice(&[GS, b'H', 2]); // texto bajo el código
    out.extend_from_slice(&[GS, b'k', 73]); // CODE128
    out.extend_from_slice(&[data.len() as u8]);
    out.extend_from_slice(data.as_bytes());
    out
}

/// Construye la secuencia de un QR (compatible con impresoras que lo soportan).
pub fn build_qr_sequence(data: &str) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(&[GS, b'(', b'k', 4, 0, 49, 65, 50, 0]); // modelo 2
    out.extend_from_slice(&[GS, b'(', b'k', 3, 0, 49, 67, 8]); // tamaño 8
    out.extend_from_slice(&[GS, b'(', b'k', 3, 0, 49, 69, 48]); // nivel de error
    let bytes = data.as_bytes();
    let len = bytes.len() as u16;
    let p1 = (len % 256) as u8;
    let p2 = (len / 256) as u8;
    out.extend_from_slice(&[GS, b'(', b'k', p1, p2, 49, 80, 48]);
    out.extend_from_slice(bytes);
    out.extend_from_slice(&[GS, b'(', b'k', 3, 0, 49, 81, 48]); // imprimir
    out
}

/// Secuencia de corte de papel.
pub fn cut_sequence() -> Vec<u8> {
    vec![GS, b'V', 66, 0]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn print_sequence_starts_with_init() {
        let seq = build_print_sequence("Hola", 42);
        assert_eq!(&seq[..2], &[ESC, b'@']);
        assert!(seq.ends_with(&[GS, b'V', 66, 0]));
    }

    #[test]
    fn print_sequence_wraps_long_lines() {
        let seq = build_print_sequence("abcdefghijklmnop", 5);
        let text = seq
            .iter()
            .filter(|&&b| b == b'\n')
            .count();
        // 4 líneas (16 chars / 5 por línea = 4 saltos) + saltos del texto
        assert!(text >= 4);
    }

    #[test]
    fn barcode_sequence_has_code128() {
        let seq = build_barcode_sequence("123456");
        assert!(seq.windows(2).any(|w| w == [GS, b'k']));
    }
}