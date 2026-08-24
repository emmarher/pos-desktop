/**
 * screens/HardwareScreen.tsx — Configuración de hardware (Fase 2).
 *
 * Comunicación serial: impresora ESC/POS y báscula. Lista puertos, prueba
 * impresión, lee peso y arranca el orquestador de Rust (start_hardware).
 */
import {useCallback, useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import TopAppBar from '../components/TopAppBar';
import GlassSurface from '../components/GlassSurface';
import POSButton from '../components/POSButton';
import {
  listPorts,
  openPort,
  closePort,
  readPort,
  startHardware,
  stopHardware,
  SerialPortInfo,
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
  const [selectedPrinter, setSelectedPrinter] = useState('');
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

  useEffect(() => {
    void loadPorts();
  }, [loadPorts]);

  const doTestPrinter = async () => {
    if (!selectedPrinter) {
      setStatus('Selecciona un puerto de impresora');
      return;
    }
    setStatus('Abriendo puerto e imprimiendo prueba…');
    try {
      await openPort({port: selectedPrinter, baud_rate: 9600});
      // Contenido de prueba: la secuencia ESC/POS se arma en Rust (printer.rs)
      setStatus(`Puerto ${selectedPrinter} lista. Usa el orquestador para
        imprimir tickets (start_hardware).`);
      await closePort();
      setStatus('Prueba de impresora enviada (si el equipo lo soporta).');
    } catch (e) {
      setStatus(`Error de impresión: ${e}`);
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
      const text = b64
        ? decodeURIComponent(escape(atob(b64)))
        : 'sin datos';
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
    setStatus('Iniciando orquestador de hardware…');
    try {
      await startHardware({
        server_ip: server.ip,
        server_port: server.port ?? 3000,
        device_id: deviceId,
        can_print: !!selectedPrinter,
        can_scale: !!selectedScale,
        printer_serial: selectedPrinter ? {port: selectedPrinter, baud_rate: 9600} : undefined,
        scale_serial: selectedScale ? {port: selectedScale, baud_rate: 9600} : undefined,
      });
      setStatus('Orquestador de hardware en ejecución (impresión + báscula).');
    } catch (e) {
      setStatus(`Error al iniciar: ${e}`);
    }
  };

  const doStop = async () => {
    try {
      await stopHardware();
      setStatus('Orquestador de hardware detenido.');
    } catch (e) {
      setStatus(`Error al detener: ${e}`);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-[var(--color-background)]">
      <TopAppBar
        title="Hardware"
        onLogout={() => {
          void logout();
          navigate('/', {replace: true});
        }}
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <GlassSurface className="p-4">
          <h3 className="mb-2 text-[var(--font-medium)] font-bold text-[var(--color-text)]">
            Puertos serial
          </h3>
          {ports.length === 0 ? (
            <p className="text-[var(--font-small)] text-[var(--color-text-secondary)]">
              Sin puertos detectados (usa un adaptador USB-serial).
            </p>
          ) : (
            <select
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] p-3 text-[var(--color-text)] outline-none"
              onChange={e => {
                setSelectedPrinter(e.target.value);
                setSelectedScale(e.target.value);
              }}
            >
              <option value="">Selecciona un puerto…</option>
              {ports.map(p => (
                <option key={p.port_name} value={p.port_name}>
                  {p.port_name} {p.description ? `· ${p.description}` : ''}
                </option>
              ))}
            </select>
          )}
          <button className="mt-2 text-[var(--font-small)] text-[var(--color-primary)] hover:underline" onClick={loadPorts}>
            Refrescar puertos
          </button>
        </GlassSurface>

        <GlassSurface className="p-4">
          <h3 className="mb-2 text-[var(--font-medium)] font-bold text-[var(--color-text)]">
            Impresora (ESC/POS)
          </h3>
          <POSButton title="Probar impresora (enviar prueba)" variant="secondary" onPress={doTestPrinter} />
        </GlassSurface>

        <GlassSurface className="p-4">
          <h3 className="mb-2 text-[var(--font-medium)] font-bold text-[var(--color-text)]">
            Báscula
          </h3>
          <button className="text-[var(--font-small)] text-[var(--color-primary)] hover:underline" onClick={doReadScale}>
            Leer peso
          </button>
          {scaleReading && (
            <p className="mt-1 text-[var(--font-regular)] font-semibold text-[var(--color-text)]">
              Peso: {scaleReading}
            </p>
          )}
        </GlassSurface>

        <GlassSurface className="p-4">
          <h3 className="mb-2 text-[var(--font-medium)] font-bold text-[var(--color-text)]">
            Orquestador de hardware
          </h3>
          <div className="flex gap-2">
            <POSButton
              title="Iniciar (poll print + báscula)"
              onPress={doStartOrchestrator}
              data-testid="btn-start-hw"
            />
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