/**
 * screens/HardwareScreen.tsx — Configuración de hardware (Fase 2 + 80mm USB).
 *
 * Soporta impresoras 80mm térmicas 203dpi por USB (WinSpool RAW) y legacy COM.
 * - USB: lista spooler (printer_usb::list_printers), print_test_usb y orquestador con printer_name.
 * - Serial: lista puertos COM, open/read/write.
 */
import {useCallback, useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import TopAppBar from '../components/TopAppBar';
import GlassSurface from '../components/GlassSurface';
import POSButton from '../components/POSButton';
import {
  listPorts,
  listPrinters,
  openPort,
  closePort,
  readPort,
  startHardware,
  stopHardware,
  printTestUsb,
  SerialPortInfo,
  PrinterInfo,
} from '../services/hardware';
import {useServerStore} from '../stores/server.store';
import {useAuthStore} from '../stores/auth.store';

export default function HardwareScreen() {
  const navigate = useNavigate();
  const server = useServerStore(s => s.server);
  const user = useAuthStore(s => s.user);
  const deviceId = user?.id ?? 'pc-pos';
  const logout = useAuthStore(s => s.logout);

  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [printerMode, setPrinterMode] = useState<'usb' | 'serial'>('usb');
  const [selectedPrinterName, setSelectedPrinterName] = useState('');
  const [selectedPrinterSerial, setSelectedPrinterSerial] = useState('');
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

  const loadPrinters = useCallback(async () => {
    try {
      const list = await listPrinters();
      setPrinters(list);
      if (list.length > 0 && !selectedPrinterName) {
        // Preseleccionar la que parece 80mm
        const pref = list.find(l => /80mm|thermal|pos|receipt/i.test(l.name)) ?? list[0];
        setSelectedPrinterName(pref.name);
      }
    } catch (e) {
      setStatus(`Error al listar impresoras: ${e}`);
    }
  }, [selectedPrinterName]);

  useEffect(() => {
    void loadPorts();
    void loadPrinters();
  }, [loadPorts, loadPrinters]);

  const doTestPrinter = async () => {
    if (printerMode === 'usb') {
      if (!selectedPrinterName) {
        setStatus('Selecciona una impresora USB (80mm)');
        return;
      }
      setStatus(`Imprimiendo prueba en "${selectedPrinterName}"…`);
      try {
        await printTestUsb(selectedPrinterName);
        setStatus(`✓ Prueba enviada a "${selectedPrinterName}" (80mm 48 cols, ESC @ + GS V corte)`);
      } catch (e) {
        setStatus(`Error de impresión USB: ${e}`);
      }
      return;
    }
    if (!selectedPrinterSerial) {
      setStatus('Selecciona un puerto serial de impresora');
      return;
    }
    setStatus('Abriendo puerto serial e imprimiendo prueba…');
    try {
      await openPort({port: selectedPrinterSerial, baud_rate: 9600});
      setStatus(`Puerto ${selectedPrinterSerial} listo. Usa el orquestador para imprimir tickets.`);
      await closePort();
      setStatus('Prueba serial enviada (si el equipo lo soporta).');
    } catch (e) {
      setStatus(`Error de impresión serial: ${e}`);
    }
  };

  const doReadScale = async () => {
    if (!selectedScale) {
      setStatus('Selecciona un puerto de báscula');
      return;
    }
    try {
      await openPort({port: selectedScale, baud_rate: 9600});
      const b64 = await readPort();
      const text = b64 ? decodeURIComponent(escape(atob(b64))) : 'sin datos';
      setScaleReading(text.trim() || 'Sin lectura');
      await closePort();
      setStatus(`Lectura de báscula (${selectedScale}): ${text.trim() || 'sin datos'}`);
    } catch (e) {
      setStatus(`Error de báscula: ${e}`);
    }
  };

  const doStartOrchestrator = async () => {
    if (!server?.ip) {
      setStatus('Conecta primero al servidor (pestaña Productos).');
      return;
    }
    const hasPrinter = printerMode === 'usb' ? !!selectedPrinterName : !!selectedPrinterSerial;
    setStatus('Iniciando orquestador de hardware…');
    try {
      await startHardware({
        server_ip: server.ip,
        server_port: server.port ?? 3000,
        device_id: deviceId,
        can_print: hasPrinter,
        can_scale: !!selectedScale,
        printer_name: printerMode === 'usb' ? selectedPrinterName || undefined : undefined,
        printer_serial:
          printerMode === 'serial' && selectedPrinterSerial
            ? {port: selectedPrinterSerial, baud_rate: 9600}
            : undefined,
        scale_serial: selectedScale ? {port: selectedScale, baud_rate: 9600} : undefined,
      });
      const via = printerMode === 'usb' ? `USB "${selectedPrinterName}"` : `COM ${selectedPrinterSerial}`;
      setStatus(`✓ Orquestador en ejecución — impresora ${hasPrinter ? via : '—'} + báscula ${selectedScale || '—'}`);
    } catch (e) {
      setStatus(`Error al iniciar: ${e}`);
    }
  };

  const doStop = async () => {
    try {
      await stopHardware();
      setStatus('Orquestador detenido.');
    } catch (e) {
      setStatus(`Error al detener: ${e}`);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-[var(--color-background)]">
      <TopAppBar
        title="Hardware"
        onBack={() => navigate(-1)}
        onLogout={() => {
          void logout();
          navigate('/', {replace: true});
        }}
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Impresora 80mm */}
        <GlassSurface className="p-4">
          <h3 className="mb-2 text-[var(--font-medium)] font-bold text-[var(--color-text)]">
            Impresora térmica 80mm (ESC/POS 203dpi)
          </h3>
          <p className="mb-3 text-[var(--font-small)] text-[var(--color-text-secondary)]">
            USB via WinSpool RAW (aparece como USB001/“80mm Series Printer”) — no como COM. En Mac se usa mock para desarrollo.
          </p>

          <div className="mb-3 flex gap-2">
            <button
              onClick={() => setPrinterMode('usb')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold ${printerMode === 'usb' ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-secondary-soft)] text-[var(--color-text)]'}`}
            >
              USB (WinSpool)
            </button>
            <button
              onClick={() => setPrinterMode('serial')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold ${printerMode === 'serial' ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-secondary-soft)] text-[var(--color-text)]'}`}
            >
              Serial COM
            </button>
          </div>

          {printerMode === 'usb' ? (
            <>
              {printers.length === 0 ? (
                <p className="text-[var(--font-small)] text-[var(--color-text-secondary)]">
                  Sin impresoras en el spooler. Instala el driver 80mm y aparecerá como “80mm Series Printer” (USB001).
                </p>
              ) : (
                <select
                  value={selectedPrinterName}
                  onChange={e => setSelectedPrinterName(e.target.value)}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] p-3 text-[var(--color-text)] outline-none"
                >
                  <option value="">Selecciona impresora USB…</option>
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
            </>
          ) : (
            <>
              {ports.length === 0 ? (
                <p className="text-[var(--font-small)] text-[var(--color-text-secondary)]">
                  Sin puertos COM detectados (usa adaptador USB-serial).
                </p>
              ) : (
                <select
                  value={selectedPrinterSerial}
                  onChange={e => setSelectedPrinterSerial(e.target.value)}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] p-3 text-[var(--color-text)] outline-none"
                >
                  <option value="">Selecciona puerto COM…</option>
                  {ports.map(p => (
                    <option key={p.port_name} value={p.port_name}>
                      {p.port_name} {p.description ? `· ${p.description}` : ''}
                    </option>
                  ))}
                </select>
              )}
              <button className="mt-2 text-[var(--font-small)] text-[var(--color-primary)] hover:underline" onClick={loadPorts}>
                Refrescar puertos COM
              </button>
            </>
          )}

          <div className="mt-3">
            <POSButton title="Probar impresora (ticket 80mm + corte GS V)" variant="secondary" onPress={doTestPrinter} />
          </div>
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

        <GlassSurface className="p-4">
          <h3 className="mb-2 text-[var(--font-medium)] font-bold text-[var(--color-text)]">Orquestador de hardware</h3>
          <p className="mb-2 text-xs text-[var(--color-text-secondary)]">
            Hace poll a /print-jobs cada 500ms (papel 80mm, 48 chars) y publica peso de báscula. Corre en Rust, sobrevive recargas del webview.
          </p>
          <div className="flex gap-2">
            <POSButton title="Iniciar (poll print + báscula)" onPress={doStartOrchestrator} data-testid="btn-start-hw" />
            <POSButton title="Detener" variant="secondary" onPress={doStop} />
          </div>
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
