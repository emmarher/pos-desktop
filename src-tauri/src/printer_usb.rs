//! printer_usb.rs — Soporte de impresora por USB (80mm ESC/POS 203dpi).
//!
//! Problema: con driver WinSpool la impresora aparece como "USB001" / "80mm
//! Series Printer" en el spooler de Windows, NO como puerto COM. Por eso
//! `serialport` no la ve. La vía correcta en Windows es WinSpool RAW:
//! OpenPrinterW → StartDocPrinterW → WritePrinter → EndDocPrinter.
//!
//! Este módulo:
//!  - en Windows: lista impresoras del spooler y escribe bytes RAW (ESC/POS).
//!  - en non-Windows (macOS/Linux dev): mock que loguea/logs + deja tests pasar.
//!
//! La secuencia ESC/POS la arma printer.rs (build_print_sequence, width 48
//! para 80mm). Aquí solo va el transporte.

use serde::Serialize;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/// Info de una impresora Windows (spooler) o mock.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterInfo {
    pub name: String,
    pub driver_name: Option<String>,
    pub port_name: Option<String>,
    /// Si está online / sin error. Mock => true.
    pub is_online: bool,
}

// ---------------------------------------------------------------------------
// Listado (cross-platform)
// ---------------------------------------------------------------------------

/// Lista impresoras disponibles en el sistema.
///
/// Windows: EnumPrintersW (PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS).
/// Otros OS: devuelve mock para desarrollo en Mac.
#[tauri::command]
pub fn list_printers() -> Result<Vec<PrinterInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        list_printers_windows()
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Mock en macOS/Linux — permite desarrollar y probar la UI sin hardware.
        Ok(vec![PrinterInfo {
            name: "Mock 80mm (dev)".to_string(),
            driver_name: Some("Mock".to_string()),
            port_name: Some("USB001".to_string()),
            is_online: true,
        }])
    }
}

#[cfg(target_os = "windows")]
fn list_printers_windows() -> Result<Vec<PrinterInfo>, String> {
    use windows::core::PCWSTR;
    use windows::Win32::Graphics::Printing::{
        EnumPrintersW, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_2W,
    };

    // Primer llamado para obtener tamaño requerido
    let mut needed: u32 = 0;
    let mut returned: u32 = 0;
    unsafe {
        let _ = EnumPrintersW(
            PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS,
            PCWSTR::null(),
            2,
            None,
            &mut needed,
            &mut returned,
        );
    }
    if needed == 0 {
        return Ok(vec![]);
    }
    let mut buf = vec![0u8; needed as usize];
    let res = unsafe {
        EnumPrintersW(
            PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS,
            PCWSTR::null(),
            2,
            Some(buf.as_mut_slice()),
            &mut needed,
            &mut returned,
        )
    };
    if res.is_err() {
        return Err(format!("EnumPrintersW falló: {:?}", res));
    }
    let count = returned as usize;
    let infos = unsafe { std::slice::from_raw_parts(buf.as_ptr() as *const PRINTER_INFO_2W, count) };
    let mut out = Vec::with_capacity(count);
    for info in infos {
        let name = unsafe {
            if info.pPrinterName.is_null() {
                String::new()
            } else {
                info.pPrinterName.to_string().unwrap_or_default()
            }
        };
        let driver = unsafe {
            if info.pDriverName.is_null() {
                None
            } else {
                Some(info.pDriverName.to_string().unwrap_or_default())
            }
        };
        let port = unsafe {
            if info.pPortName.is_null() {
                None
            } else {
                Some(info.pPortName.to_string().unwrap_or_default())
            }
        };
        // Filtrar impresoras virtuales PDF/XPS/Fax que no sirven para 80mm directo.
        if is_virtual_printer(&name) {
            continue;
        }
        // PRINTER_INFO_2W.Status bit 0x00000002 = offline? Usamos is_online = true por defecto.
        out.push(PrinterInfo {
            name,
            driver_name: driver,
            port_name: port,
            is_online: true,
        });
    }
    Ok(out)
}

/// Retorna true si la impresora es virtual (PDF/XPS/Fax) y no debe usarse como 80mm directa.
fn is_virtual_printer(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.contains("microsoft print to pdf")
        || lower.contains("microsoft xps")
        || lower.contains("xps document writer")
        || lower.contains("onenote")
        || lower.contains("fax")
        || lower.contains("adobe pdf")
        || lower.contains("pdf24")
        || (lower.contains("print to pdf") && !lower.contains("80mm") && !lower.contains("thermal"))
}

// ---------------------------------------------------------------------------
// Transporte RAW (cross-platform)
// ---------------------------------------------------------------------------

/// Envía bytes RAW (ya con ESC/POS) a la impresora por nombre del spooler.
///
/// Content: Vec<u8> en base64 o bytes. El caller ya pasó por build_print_sequence.
#[tauri::command]
pub fn print_raw_usb(printer_name: String, data_base64: String) -> Result<usize, String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data_base64)
        .map_err(|e| format!("base64 inválido: {e}"))?;
    send_raw(&printer_name, &bytes)?;
    Ok(bytes.len())
}

/// Envía bytes RAW a la impresora. Interfaz usada por hardware.rs (poll).
pub fn send_raw(printer_name: &str, data: &[u8]) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        send_raw_winspool(printer_name, data)
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Mock en dev: log + ok (no crashea, no lag)
        eprintln!(
            "[printer_usb mock] {} bytes → \"{}\" (secuencia {}…{})",
            data.len(),
            printer_name,
            data.first().copied().unwrap_or(0),
            data.last().copied().unwrap_or(0)
        );
        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn send_raw_winspool(printer_name: &str, data: &[u8]) -> Result<(), String> {
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::Graphics::Printing::{
        ClosePrinter, EndDocPrinter, EndPagePrinter, OpenPrinterW, StartDocPrinterW,
        StartPagePrinter, WritePrinter, DOC_INFO_1W,
    };

    let wide_name: Vec<u16> = printer_name.encode_utf16().chain(std::iter::once(0)).collect();
    let mut handle = HANDLE::default();
    let open = unsafe { OpenPrinterW(PCWSTR(wide_name.as_ptr()), &mut handle, None) };
    if open.is_err() {
        return Err(format!("OpenPrinterW falló para \"{printer_name}\": {open:?}"));
    }
    // Ensure close on drop
    struct Guard(HANDLE);
    impl Drop for Guard {
        fn drop(&mut self) {
            unsafe { let _ = ClosePrinter(self.0); }
        }
    }
    let _guard = Guard(handle);

    let mut doc_name: Vec<u16> = "POS Ticket\0".encode_utf16().collect();
    // RAW = pasar bytes tal cual al driver (ESC/POS). Sin conversión.
    let mut data_type: Vec<u16> = "RAW\0".encode_utf16().collect();
    let doc_info = DOC_INFO_1W {
        pDocName: PWSTR(doc_name.as_mut_ptr()),
        pOutputFile: PWSTR::null(),
        pDatatype: PWSTR(data_type.as_mut_ptr()),
    };
    let job_id = unsafe { StartDocPrinterW(handle, 1, &doc_info) };
    if job_id == 0 {
        return Err(format!("StartDocPrinterW falló (job 0) para \"{printer_name}\""));
    }
    if !unsafe { StartPagePrinter(handle) }.as_bool() {
        unsafe { let _ = EndDocPrinter(handle); }
        return Err("StartPagePrinter falló".to_string());
    }
    let mut written: u32 = 0;
    let ok = unsafe {
        WritePrinter(
            handle,
            data.as_ptr() as *const core::ffi::c_void,
            data.len() as u32,
            &mut written,
        )
    };
    // Siempre cerrar page/doc incluso si WritePrinter falla
    unsafe { let _ = EndPagePrinter(handle); }
    unsafe { let _ = EndDocPrinter(handle); }
    if !ok.as_bool() {
        return Err(format!("WritePrinter falló: {ok:?}"));
    }
    if written as usize != data.len() {
        return Err(format!(
            "WritePrinter incompleto: {written}/{} bytes",
            data.len()
        ));
    }
    Ok(())
}

/// Test rápido de impresión por USB: arma ticket de prueba (80mm, 48 chars) y lo envía.
#[tauri::command]
pub fn print_test_usb(printer_name: String) -> Result<(), String> {
    use crate::printer::build_print_sequence;
    let content = "=== PRUEBA 80mm ===\nPOS Desktop\nHola mundo 123\n¡Ticket OK!\n";
    let seq = build_print_sequence(content, 48);
    send_raw(&printer_name, &seq)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn printer_info_serializes() {
        let info = PrinterInfo {
            name: "80mm Series".into(),
            driver_name: Some("80mm".into()),
            port_name: Some("USB001".into()),
            is_online: true,
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("80mm Series"));
    }

    #[test]
    fn send_raw_mock_ok() {
        // En macOS/Linux el mock siempre Ok (no crashea).
        let r = send_raw("Mock 80mm (dev)", b"hello");
        #[cfg(not(target_os = "windows"))]
        assert!(r.is_ok());
        #[cfg(target_os = "windows")]
        let _ = r; // en Windows requeriría spooler real
    }
}
