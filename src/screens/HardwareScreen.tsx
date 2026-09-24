/**
 * screens/HardwareScreen.tsx — Configuración de hardware USB 80mm (Fase 1 directa).
 *
 * Fase 1: impresión DIRECTA por USB WinSpool RAW (80mm 48 cols, ESC @ + GS V).
 * No usa Serial ni orquestador delegado; la venta imprime directo vía
 * printTicketDirect (lee impresora persistida en storage).
 * La sección Báscula se mantiene para lectura puntual.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopAppBar from '../components/TopAppBar';
import GlassSurface from '../components/GlassSurface';
import POSButton from '../components/POSButton';
import {
  listPorts,
  listPrinters,
  openPort,
  closePort,
  readPort,
  printTestUsb,
  getPersistedUsbPrinter,
  persistUsbPrinter,
  SerialPortInfo,
  PrinterInfo,
} from '../services/hardware';
import { useAuthStore } from '../stores/auth.store';

export default function HardwareScreen() {
  const navigate = useNavigate();
  const logout = useAuthStore(s => s.logout);

  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [selectedPrinterName, setSelectedPrinterName] = useState('');
  const [selectedScale, setSelectedScale] = useState('');
  const [status, setStatus] = useState('');
  const [scaleReading, setScaleReading] = useState('');

  const loadPorts = useCallback(async () => {
    try {
      const p = await listPorts();
      setPorts(p);
    } catch (e) {
      setStatus(`Error al listar puertos: ${e}`);
    }
  }, []);

  const VIRTUAL_PRINTER_RE = /microsoft print to pdf|microsoft xps|xps document writer|onenote|fax|adobe pdf|pdf24|print to pdf/i;

  const filterPrinters = (list: PrinterInfo[]): PrinterInfo[] =>
    list.filter(p => p.portName?.toUpperCase() === 'USB001' || !VIRTUAL_PRINTER_RE.test(p.name));

  const loadPrinters = useCallback(async () => {
    try {
      const raw = await listPrinters();
      // Doble defensa: aunque Rust ya filtra, excluimos virtuales aquí por si queda alguna (PDF24, etc).
      const list = filterPrinters(raw);
      setPrinters(list);
      // Restaurar selección persistida — virtual solo se limpia si no es USB001 físico
      const persisted = await getPersistedUsbPrinter();
      if (persisted?.printerName) {
        const isUsb001 = persisted.portName?.toUpperCase() === 'USB001';
        if (!isUsb001 && VIRTUAL_PRINTER_RE.test(persisted.printerName)) {
          // Persistida era PDF/XPS -> limpiar
          const { default: AsyncStorage } = await import('../lib/storage');
          await AsyncStorage.removeItem('pos.hardware.usb');
          setSelectedPrinterName('');
          setStatus('Impresora virtual eliminada (Microsoft Print to PDF no es válida para 80mm). Selecciona la térmica 80mm.');
        } else {
          const exists = list.some(l => l.name === persisted.printerName);
          if (exists) {
            setSelectedPrinterName(persisted.printerName);
            return;
          }
        }
      }
      // Fallback: preseleccionar y auto-persistir la 80mm si no hay persistida (evita "Sin impresora" en venta)
      if (list.length > 0) {
        const pref = list.find(l => /80mm|thermal|pos|receipt/i.test(l.name)) ?? list[0];
        if (pref) {
          const prev = await getPersistedUsbPrinter();
          if (!prev?.printerName) {
            await persistUsbPrinter({
              printerName: pref.name,
              portName: pref.portName,
              driverName: pref.driverName,
            });
            setStatus(`✓ Impresora 80mm detectada y guardada: "${pref.name}" (directa por defecto)`);
          }
          setSelectedPrinterName(prevName => prevName || pref.name);
        }
      }
    } catch (e) {
      setStatus(`Error al listar impresoras: ${e}`);
    }
  }, []);

  useEffect(() => {
    void loadPorts();
    void loadPrinters();
  }, [loadPorts, loadPrinters]);

  // Persistir al cambiar selección (impresión directa por defecto)
  const handleSelectPrinter = async (name: string) => {
    const infoForCheck = printers.find(p => p.name === name);
    const isUsb001 = infoForCheck?.portName?.toUpperCase() === 'USB001';
    if (name && !isUsb001 && VIRTUAL_PRINTER_RE.test(name)) {
      setStatus('Impresora virtual no válida para ticket 80mm (PDF/XPS/Fax). Selecciona la térmica 80mm.');
      return;
    }
    setSelectedPrinterName(name);
    if (name) {
      const info = printers.find(p => p.name === name);
      await persistUsbPrinter({
        printerName: name,
        portName: info?.portName,
        driverName: info?.driverName,
      });
      setStatus(`✓ Impresora directa: "${name}" (80mm) guardada`);
    }
  };

  const doTestPrinter = async () => {
    if (!selectedPrinterName) {
      setStatus('Selecciona una impresora USB (80mm)');
      return;
    }
    setStatus(`Imprimiendo prueba en "${selectedPrinterName}"…`);
    try {
      await printTestUsb(selectedPrinterName);
      // Asegurar persistencia al probar
      const info = printers.find(p => p.name === selectedPrinterName);
      await persistUsbPrinter({
        printerName: selectedPrinterName,
        portName: info?.portName,
        driverName: info?.driverName,
      });
      setStatus(`✓ Prueba enviada a "${selectedPrinterName}" (80mm 48 cols, ESC @ + GS V corte)`);
    } catch (e) {
      setStatus(`Error de impresión USB: ${e}`);
    }
  };

  const doReadScale = async () => {
    if (!selectedScale) {
      setStatus('Selecciona un puerto de báscula');
      return;
    }
    try {
      await openPort({ port: selectedScale, baud_rate: 9600 });
      const b64 = await readPort();
      const text = b64 ? decodeURIComponent(escape(atob(b64))) : 'sin datos';
      setScaleReading(text.trim() || 'Sin lectura');
      await closePort();
      setStatus(`Lectura de báscula (${selectedScale}): ${text.trim() || 'sin datos'}`);
    } catch (e) {
      setStatus(`Error de báscula: ${e}`);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-[var(--color-background)]">
      <TopAppBar
        title="Hardware"
        onBack={() => navigate(-1)}
        onLogout={() => {
          void logout();
          navigate('/', { replace: true });
        }}
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Impresora 80mm USB directa */}
        <GlassSurface className="p-4">
          <h3 className="mb-2 text-[var(--font-medium)] font-bold text-[var(--color-text)]">
            Impresora térmica 80mm directa (USB WinSpool RAW)
          </h3>
          <p className="mb-3 text-[var(--font-small)] text-[var(--color-text-secondary)]">
            La venta imprime <strong>directo</strong> por WinSpool (USB001 / "80mm Series Printer") sin pasar por el servidor.
            Ancho por defecto 80mm / 48 columnas. En Mac se usa mock para desarrollo.
          </p>

          {printers.length === 0 ? (
            <div>
              <p className="text-[var(--font-small)] text-[var(--color-text-secondary)]">
                Sin impresora 80mm detectada en USB001. Verifica en Windows: Configuración → Impresoras → Puerto USB001 (tu puerto es USB001).
              </p>
              <p className="mt-1 text-[var(--font-small)] text-[var(--color-text-secondary)]">
                Las virtuales PDF/XPS/Fax se ocultan. Si tu térmica está en USB001 y no aparece, reinstala el driver 80mm en ese puerto.
              </p>
            </div>
          ) : (
            <select
              value={selectedPrinterName}
              onChange={e => void handleSelectPrinter(e.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] p-3 text-[var(--color-text)] outline-none"
            >
              <option value="">Selecciona impresora USB 80mm…</option>
              {printers.map(p => (
                <option key={p.name} value={p.name}>
                  {p.name} {p.portName ? `· ${p.portName}` : ''} {p.driverName ? `· ${p.driverName}` : ''}
                </option>
              ))}
            </select>
          )}
          <button className="mt-2 text-[var(--font-small)] text-[var(--color-primary)] hover:underline" onClick={loadPrinters}>
            Refrescar impresoras
          </button>

          <div className="mt-3">
            <POSButton title="Probar impresora (ticket 80mm + corte GS V)" variant="secondary" onPress={doTestPrinter} />
          </div>
          {selectedPrinterName && (
            <p className="mt-2 text-[var(--font-small)] text-[var(--color-success)]">
              Directa activa: {selectedPrinterName} (cada venta imprimirá aquí)
            </p>
          )}
        </GlassSurface>

        <GlassSurface className="p-4">
          <h3 className="mb-2 text-[var(--font-medium)] font-bold text-[var(--color-text)]">Báscula</h3>
          {ports.length > 0 ? (
            <select
              value={selectedScale}
              onChange={e => setSelectedScale(e.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] p-3 text-[var(--color-text)] outline-none"
            >
              <option value="">Selecciona puerto báscula…</option>
              {ports.map(p => (
                <option key={`scale-${p.port_name}`} value={p.port_name}>
                  {p.port_name} {p.description ? `· ${p.description}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-[var(--font-small)] text-[var(--color-text-secondary)]">Sin puertos COM para báscula.</p>
          )}
          <button className="mt-2 text-[var(--font-small)] text-[var(--color-primary)] hover:underline" onClick={doReadScale}>
            Leer peso
          </button>
          {scaleReading && (
            <p className="mt-1 text-[var(--font-regular)] font-semibold text-[var(--color-text)]">Peso: {scaleReading}</p>
          )}
        </GlassSurface>

        {status && (
          <p className="rounded-md bg-[var(--color-secondary-soft)] p-3 text-[var(--font-small)] font-medium text-[var(--color-text)]">
            {status}
          </p>
        )}
      </div>
    </div>
  );
}
