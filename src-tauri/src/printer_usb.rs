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
        // Filtrar virtuales PDF/XPS/Fax — pero NUNCA filtrar USB001 real (puerto físico 80mm).
        let is_usb001 = port.as_deref().map(|p| p.eq_ignore_ascii_case("USB001")).unwrap_or(false);
        if !is_usb001 && is_virtual_printer(&name) {
            continue;
        }
        // Estado real: una impresora listada pero offline (apagada/desconectada)
        // debe marcarse is_online=false para que la UI no la ofrezca como válida
        // ni reporte "impreso" al encolar en spool. Si no se puede abrir, offline.
        let is_online = printer_is_online(&name).unwrap_or(false);
        out.push(PrinterInfo {
            name,
            driver_name: driver,
            port_name: port,
            is_online,
        });
    }
    Ok(out)
}

/// Bits de PRINTER_INFO_2W.Status que implican "no va a salir papel".
/// Describe por qué una impresora no está disponible, o None si está OK.
/// Función pura (testeable sin hardware ni Windows): los valores son del ABI
/// Win32 PRINTER_STATUS_* (congelados; no dependen del crate `windows`).
fn status_unavailable_reason(status: u32) -> Option<&'static str> {
    const PRINTER_STATUS_ERROR: u32 = 2;
    const PRINTER_STATUS_PAPER_OUT: u32 = 16;
    const PRINTER_STATUS_OFFLINE: u32 = 128;
    const PRINTER_STATUS_NOT_AVAILABLE: u32 = 4096;
    if status & PRINTER_STATUS_OFFLINE != 0 {
        return Some("offline (apagada o desconectada)");
    }
    if status & PRINTER_STATUS_PAPER_OUT != 0 {
        return Some("sin papel");
    }
    if status & PRINTER_STATUS_ERROR != 0 {
        return Some("en error");
    }
    if status & PRINTER_STATUS_NOT_AVAILABLE != 0 {
        return Some("no disponible");
    }
    None
}

/// Lee los flags Status (PRINTER_INFO_2W nivel 2) de un handle abierto.
#[cfg(target_os = "windows")]
fn printer_status_flags(
    handle: windows::Win32::Foundation::HANDLE,
) -> Result<u32, String> {
    use windows::Win32::Graphics::Printing::{GetPrinterW, PRINTER_INFO_2W};
    // Patrón dos llamadas: primero tamaño, luego datos.
    let mut needed: u32 = 0;
    unsafe {
        let _ = GetPrinterW(handle, 2, None, &mut needed);
    }
    if needed == 0 {
        return Err("GetPrinterW: tamaño 0".to_string());
    }
    let mut buf = vec![0u8; needed as usize];
    let mut needed2: u32 = 0;
    unsafe { GetPrinterW(handle, 2, Some(buf.as_mut_slice()), &mut needed2) }
        .map_err(|e| format!("GetPrinterW falló: {e:?}"))?;
    let info = unsafe { &*(buf.as_ptr() as *const PRINTER_INFO_2W) };
    Ok(info.Status)
}

/// Abre la impresora por nombre y reporta si está en condiciones de imprimir.
/// Ok(true) = lista; Ok(false) = existe pero no disponible; Err = no se pudo consultar.
#[cfg(target_os = "windows")]
fn printer_is_online(printer_name: &str) -> Result<bool, String> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::Graphics::Printing::{ClosePrinter, OpenPrinterW};
    let wide_name: Vec<u16> = printer_name.encode_utf16().chain(std::iter::once(0)).collect();
    let mut handle = HANDLE::default();
    let open = unsafe { OpenPrinterW(PCWSTR(wide_name.as_ptr()), &mut handle, None) };
    if open.is_err() {
        return Err(format!("OpenPrinterW falló para \"{printer_name}\""));
    }
    struct Guard(HANDLE);
    impl Drop for Guard {
        fn drop(&mut self) {
            unsafe {
                let _ = ClosePrinter(self.0);
            }
        }
    }
    let _guard = Guard(handle);
    let status = printer_status_flags(handle)?;
    Ok(status_unavailable_reason(status).is_none())
}

/// Retorna true si la impresora es virtual (PDF/XPS/Fax) y no debe usarse como 80mm directa.
fn is_virtual_printer(name: &str) -> bool {    let lower = name.to_lowercase();
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
pub fn print_raw_usb(printer_name: String, data_base64: String) -> PrintResult {
    use base64::Engine as _;
    let bytes = match base64::engine::general_purpose::STANDARD.decode(&data_base64) {
        Ok(b) => b,
        Err(e) => {
            return PrintResult {
                outcome: PrintOutcome::Failed,
                detail: Some(format!("base64 inválido: {e}")),
            }
        }
    };
    send_raw(&printer_name, &bytes)
}

/// Resultado tri-estado de una impresión (PRN-2: confirmar papel, no solo spool).
///
/// - `Printed`: el spooler reportó JOB_STATUS_PRINTED/COMPLETE (papel afuera).
/// - `SentUnconfirmed`: bytes aceptados pero sin confirmación en el timeout
///   (el papel pudo salir; no afirmar ni negar).
/// - `Failed`: rechazo previo (offline/sin papel/error) o fallo del job.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PrintOutcome {
    Printed,
    SentUnconfirmed,
    Failed,
}

/// Resultado serializable a TS de print_raw_usb / print_test_usb.
#[derive(Debug, Clone, Serialize)]
pub struct PrintResult {
    pub outcome: PrintOutcome,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

/// Envía bytes RAW a la impresora. Interfaz usada por hardware.rs (poll).
pub fn send_raw(printer_name: &str, data: &[u8]) -> PrintResult {
    #[cfg(target_os = "windows")]
    {
        print_job_and_confirm(printer_name, data)
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Mock en dev: log + impreso (no crashea, no lag)
        eprintln!(
            "[printer_usb mock] {} bytes → \"{}\" (secuencia {}…{})",
            data.len(),
            printer_name,
            data.first().copied().unwrap_or(0),
            data.last().copied().unwrap_or(0)
        );
        PrintResult {
            outcome: PrintOutcome::Printed,
            detail: None,
        }
    }
}

/// Imprime un trabajo completo con confirmación de papel (PRN-2).
///
/// Flujo Windows: abrir → chequear Status → StartDoc → escribir → EndDoc →
/// poll GetJobW(job_id) hasta PRINTED/COMPLETE, fallo o timeout (15s).
/// El handle vive en todo el flujo (Guard lo cierra al salir).
/// Nunca retorna Err: todo se expresa en PrintResult para que TS decida mensajes.
#[cfg(target_os = "windows")]
fn print_job_and_confirm(printer_name: &str, data: &[u8]) -> PrintResult {
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::Graphics::Printing::{
        ClosePrinter, EndDocPrinter, EndPagePrinter, OpenPrinterW, StartDocPrinterW,
        StartPagePrinter, WritePrinter, DOC_INFO_1W,
    };

    let fail = |detail: String| PrintResult {
        outcome: PrintOutcome::Failed,
        detail: Some(detail),
    };

    let wide_name: Vec<u16> = printer_name.encode_utf16().chain(std::iter::once(0)).collect();
    let mut handle = HANDLE::default();
    let open = unsafe { OpenPrinterW(PCWSTR(wide_name.as_ptr()), &mut handle, None) };
    if open.is_err() {
        return fail(format!("OpenPrinterW falló para \"{printer_name}\": {open:?}"));
    }
    // Ensure close on drop
    struct Guard(HANDLE);
    impl Drop for Guard {
        fn drop(&mut self) {
            unsafe { let _ = ClosePrinter(self.0); }
        }
    }
    let _guard = Guard(handle);

    // WinSpool acepta el trabajo aunque la impresora esté apagada/desconectada
    // (queda encolado y WritePrinter reporta éxito). Para no mentir con
    // "Ticket impreso", se verifica Status ANTES de enviar: offline, sin papel
    // o en error → Failed honesto que la UI muestra como "no se imprimió".
    match printer_status_flags(handle) {
        Ok(status) => {
            if let Some(reason) = status_unavailable_reason(status) {
                return fail(format!("Impresora \"{printer_name}\" no disponible ({reason})"));
            }
        }
        Err(e) => {
            return fail(format!("No se pudo leer el estado de \"{printer_name}\": {e}"));
        }
    }

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
        return fail(format!("StartDocPrinterW falló (job 0) para \"{printer_name}\""));
    }
    if !unsafe { StartPagePrinter(handle) }.as_bool() {
        unsafe { let _ = EndDocPrinter(handle); }
        return fail("StartPagePrinter falló".to_string());
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
        return fail(format!("WritePrinter falló: {ok:?}"));
    }
    if written as usize != data.len() {
        return fail(format!(
            "WritePrinter incompleto: {written}/{} bytes",
            data.len()
        ));
    }

    // Confirmación de papel: poll del job hasta impreso, fallo o timeout.
    // Bloquea el comando Tauri (la UI muestra spinner en estos flujos).
    match wait_job_printed(handle, job_id) {
        JobWait::Printed => PrintResult {
            outcome: PrintOutcome::Printed,
            detail: None,
        },
        JobWait::Failed(reason) => fail(format!("Impresora \"{printer_name}\": {reason}")),
        JobWait::Timeout => PrintResult {
            outcome: PrintOutcome::SentUnconfirmed,
            detail: Some("enviado al spooler sin confirmación de papel".to_string()),
        },
    }
}

/// Resultado interno de la espera del job (no se serializa; ver PrintResult).
#[cfg(target_os = "windows")]
enum JobWait {
    Printed,
    Failed(&'static str),
    Timeout,
}

/// Mapeo puro de bits JOB_STATUS_* a desenlace (testeable sin spooler).
/// None = seguir esperando (estados transitorios: spooling/printing/pausado).
#[cfg(target_os = "windows")]
fn job_status_outcome(status: u32) -> Option<JobWait> {
    use windows::Win32::Graphics::Printing::{
        JOB_STATUS_COMPLETE, JOB_STATUS_ERROR, JOB_STATUS_OFFLINE, JOB_STATUS_PAPEROUT,
        JOB_STATUS_PRINTED,
    };
    if status & (JOB_STATUS_PRINTED | JOB_STATUS_COMPLETE) != 0 {
        return Some(JobWait::Printed);
    }
    if status & JOB_STATUS_ERROR != 0 {
        return Some(JobWait::Failed("error del trabajo de impresión"));
    }
    if status & JOB_STATUS_OFFLINE != 0 {
        return Some(JobWait::Failed("impresora offline durante la impresión"));
    }
    if status & JOB_STATUS_PAPEROUT != 0 {
        return Some(JobWait::Failed("sin papel durante la impresión"));
    }
    None
}

/// Espera hasta 15s (30 × 500ms) a que el job salga del spooler.
/// Si el job desaparece de la cola (GetJobW falla), se asume impreso: el
/// spooler lo elimina al terminar de des-encolarlo al driver.
#[cfg(target_os = "windows")]
fn wait_job_printed(
    handle: windows::Win32::Foundation::HANDLE,
    job_id: u32,
) -> JobWait {
    use windows::Win32::Graphics::Printing::{GetJobW, JOB_INFO_2W};
    for _ in 0..30 {
        let mut needed: u32 = 0;
        unsafe {
            let _ = GetJobW(handle, job_id, 2, None, &mut needed);
        }
        if needed > 0 {
            let mut buf = vec![0u8; needed as usize];
            let mut needed2: u32 = 0;
            let ok =
                unsafe { GetJobW(handle, job_id, 2, Some(buf.as_mut_slice()), &mut needed2) };
            if ok.as_bool() {
                let info = unsafe { &*(buf.as_ptr() as *const JOB_INFO_2W) };
                if let Some(outcome) = job_status_outcome(info.Status) {
                    return outcome;
                }
            } else {
                // Job ya fuera de la cola = des-encolado al driver = impreso.
                return JobWait::Printed;
            }
        } else {
            return JobWait::Printed;
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
    JobWait::Timeout
}

/// Test rápido de impresión por USB: arma ticket de prueba (80mm, 48 chars) y lo envía.
/// Retorna el resultado tri-estado (la UI muestra impreso / no impreso / sin confirmar).
#[tauri::command]
pub fn print_test_usb(printer_name: String) -> PrintResult {
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
    fn status_unavailable_reason_maps_win32_bits() {
        assert_eq!(status_unavailable_reason(0), None);
        assert_eq!(
            status_unavailable_reason(128),
            Some("offline (apagada o desconectada)")
        );
        assert_eq!(status_unavailable_reason(16), Some("sin papel"));
        assert_eq!(status_unavailable_reason(2), Some("en error"));
        assert_eq!(status_unavailable_reason(4096), Some("no disponible"));
        // Offline domina sobre otros bits
        assert_eq!(
            status_unavailable_reason(128 | 16),
            Some("offline (apagada o desconectada)")
        );
    }
    #[test]
    fn send_raw_mock_ok() {
        // En macOS/Linux el mock siempre impreso (no crashea).
        let r = send_raw("Mock 80mm (dev)", b"hello");
        #[cfg(not(target_os = "windows"))]
        assert_eq!(r.outcome, PrintOutcome::Printed);
        #[cfg(target_os = "windows")]
        let _ = r; // en Windows requeriría spooler real
    }

    #[test]
    fn job_status_outcome_maps_spooler_bits() {
        // Solo existe en Windows: valida el mapeo contra las consts Win32 reales.
        #[cfg(target_os = "windows")]
        {
            use super::{job_status_outcome, JobWait};
            use windows::Win32::Graphics::Printing::{
                JOB_STATUS_COMPLETE, JOB_STATUS_ERROR, JOB_STATUS_OFFLINE,
                JOB_STATUS_PAPEROUT, JOB_STATUS_PRINTED, JOB_STATUS_PRINTING,
                JOB_STATUS_SPOOLING,
            };
            assert!(matches!(job_status_outcome(JOB_STATUS_PRINTED), Some(JobWait::Printed)));
            assert!(matches!(job_status_outcome(JOB_STATUS_COMPLETE), Some(JobWait::Printed)));
            assert!(matches!(job_status_outcome(JOB_STATUS_ERROR), Some(JobWait::Failed(_))));
            assert!(matches!(job_status_outcome(JOB_STATUS_OFFLINE), Some(JobWait::Failed(_))));
            assert!(matches!(job_status_outcome(JOB_STATUS_PAPEROUT), Some(JobWait::Failed(_))));
            // Transitorios (spooling/printing) = seguir esperando
            assert!(job_status_outcome(0).is_none());
            assert!(job_status_outcome(JOB_STATUS_SPOOLING).is_none());
            assert!(job_status_outcome(JOB_STATUS_PRINTING).is_none());
        }
    }
}
