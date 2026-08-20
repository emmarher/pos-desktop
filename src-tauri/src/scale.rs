//! scale.rs — Parser configurable de frames de báscula (RF-BA).
//!
//! Sin hardware aún: se define un parser genérico configurable por regex o
//! frame fijo (start byte + longitud), con presets para marcas comunes.
//! El resultado se emite a la UI y se publica en /scale/current.

use serde::Serialize;

/// Configuración del parser de báscula.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaleConfig {
    /// Puerto serial de la báscula.
    pub port: String,
    pub baud_rate: Option<u32>,
    /// Modo de parsing: "regex" | "fixed" | "line".
    pub parser_mode: Option<String>,
    /// Regex con grupo de captura "weight" (modo regex).
    pub regex: Option<String>,
    /// Longitud de la trama en bytes (modo fixed).
    pub frame_length: Option<usize>,
    /// Offset del peso dentro de la trama (modo fixed).
    pub weight_offset: Option<usize>,
    /// Factor de escala (modo fixed): peso = raw / divisor.
    pub divisor: Option<f64>,
    /// Unidad de salida (kg/g/lb).
    pub unit: Option<String>,
    /// Carácter de separación de líneas (modo line).
    pub line_separator: Option<String>,
}

/// Configuración por defecto (genérica, sin equipos reales).
impl Default for ScaleConfig {
    fn default() -> Self {
        Self {
            port: String::new(),
            baud_rate: Some(9600),
            parser_mode: Some("regex".to_string()),
            regex: Some(r"(?P<weight>\d+(?:\.\d+)?)".to_string()),
            frame_length: None,
            weight_offset: None,
            divisor: Some(1.0),
            unit: Some("kg".to_string()),
            line_separator: Some("\n".to_string()),
        }
    }
}

/// Lectura de peso parseada.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaleReading {
    pub weight: f64,
    pub unit: String,
    pub stable: bool,
}

/// Intenta extraer el peso de una trama recibida según la configuración.
///
/// Es una función pura (testeable). El streaming de la báscula acumula
/// bytes y llama a esta función por cada línea/trama completa.
pub fn parse_frame(raw: &str, config: &ScaleConfig) -> Option<ScaleReading> {
    let weight = match config.parser_mode.as_deref() {
        Some("fixed") => parse_fixed(raw.as_bytes(), config)?,
        Some("line") => parse_line(raw, config)?,
        _ => parse_regex(raw, config)?,
    };
    Some(ScaleReading {
        weight,
        unit: config.unit.clone().unwrap_or_else(|| "kg".to_string()),
        // TODO: sin hardware no hay bit de estabilidad; se marca estable
        // cuando el peso no cambió entre lecturas (decidirá hardware.rs).
        stable: true,
    })
}

fn parse_regex(raw: &str, config: &ScaleConfig) -> Option<f64> {
    let re = regex::Regex::new(config.regex.as_deref()?).ok()?;
    let caps = re.captures(raw)?;
    let val = if let Some(m) = caps.name("weight") {
        m.as_str().parse::<f64>().ok()?
    } else {
        caps.get(1)?.as_str().parse::<f64>().ok()?
    };
    apply_divisor(val, config)
}

fn parse_line(raw: &str, config: &ScaleConfig) -> Option<f64> {
    let sep = config.line_separator.clone().unwrap_or_else(|| "\n".to_string());
    let line = raw.split(&sep).find(|l| !l.trim().is_empty())?;
    parse_regex(line, config)
}

fn parse_fixed(raw: &[u8], config: &ScaleConfig) -> Option<f64> {
    let len = config.frame_length?;
    if raw.len() < len {
        return None;
    }
    let off = config.weight_offset.unwrap_or(0);
    let mut val = 0u32;
    for &b in &raw[off..off + 4] {
        val = (val << 8) | b as u32;
    }
    Some(apply_divisor(val as f64, config)?)
}

fn apply_divisor(val: f64, config: &ScaleConfig) -> Option<f64> {
    let d = config.divisor.unwrap_or(1.0);
    if d <= 0.0 {
        None
    } else {
        Some(val / d)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> ScaleConfig {
        ScaleConfig::default()
    }

    #[test]
    fn regex_parses_weight() {
        let r = parse_frame("ST, 12.345 kg\r\n", &cfg()).unwrap();
        assert!((r.weight - 12.345).abs() < 1e-9);
    }

    #[test]
    fn regex_missing_returns_none() {
        assert!(parse_frame("ERR", &cfg()).is_none());
    }

    #[test]
    fn line_mode_uses_first_line() {
        let mut c = cfg();
        c.parser_mode = Some("line".to_string());
        let r = parse_frame("STABLE,1.250 kg\nST,2.000 kg", &c).unwrap();
        assert!((r.weight - 1.250).abs() < 1e-9);
    }

    #[test]
    fn divisor_applies() {
        let mut c = cfg();
        c.divisor = Some(1000.0);
        let r = parse_frame("1250", &c).unwrap();
        assert!((r.weight - 1.25).abs() < 1e-9);
    }
}