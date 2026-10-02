/**
 * screens/ConnectionScreen.tsx — Pantalla de conexión al servidor (RF-DS).
 *
 * Portada de pos-mobil a React DOM + Tailwind + react-router.
 * Flujo: discovery automático → login manual (IP/QR).
 */
import {useCallback, useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useTheme} from '../hooks/useTheme';
import {useServerStore} from '../stores/server.store';
import {discoverServer, applyServer, sweepLan} from '../api/discovery';
import {syncServerToRust} from '../api/client';
import {useAuthStore} from '../stores/auth.store';
import {API_PORT} from '../constants/app';
import {toast} from '../hooks/useToast';
import POSButton from '../components/POSButton';
import GlassBackground from '../components/GlassBackground';
import GlassSurface from '../components/GlassSurface';

export default function ConnectionScreen() {
  const navigate = useNavigate();
  useTheme(); // ensure theme context is initialized
  const {status, lastError, setLastError, resetFailures} = useServerStore(state => state);
  const {isAuthenticated} = useAuthStore(state => state);

  /* ── 1) ESTADO LOCAL ──────────────────────────────────────────────── */
  const [searching, setSearching] = useState(false);
  const [manualIp, setManualIp] = useState('');
  const [manualPort, setManualPort] = useState(String(API_PORT));
  const [deepSearching, setDeepSearching] = useState(false);
  const [deepError, setDeepError] = useState<string | null>(null);

  /* ── 2) DESCUBRIMIENTO AUTOMÁTICO ─────────────────────────────────── */
  const runDiscovery = useCallback(async () => {
    setSearching(true);
    const found = await discoverServer();
    setSearching(false);
    if (found) {
      const store = useServerStore.getState();
      resetFailures();
      store.setServer({ip: found.ip, port: found.port ?? 3000});
      store.setStatus('connected');
      // Fijar el servidor en Rust para las peticiones HTTP (seguridad).
      await syncServerToRust(found.ip, found.port ?? 3000);
      navigate('/login', {state: {tenantCode: found.tenantCode}});
    }
  }, [navigate]);

  useEffect(() => {
    if (isAuthenticated || searching) return;
    runDiscovery();
  }, [isAuthenticated, searching, navigate]);

  /* ── 3) ACCIONES MANUALES ──────────────────────────────────────────── */
  const handleManualConnect = useCallback(async () => {
    const ip = manualIp.trim();
    if (!ip) {
      toast.error('Ingresa la dirección IP del servidor.');
      return;
    }
    const port = parseInt(manualPort, 10) || API_PORT;
    setLastError(null);
    try {
      await applyServer({ip, port});
      navigate('/login');
    } catch {
      setLastError('No se pudo conectar al servidor');
    }
  }, [manualIp, manualPort, navigate, setLastError]);

  /* Búsqueda profunda: barrido /24 (último recurso, manual). */
  const handleDeepSearch = useCallback(async () => {
    const port = parseInt(manualPort, 10) || API_PORT;
    setDeepError(null);
    setLastError(null);
    setDeepSearching(true);
    const found = await sweepLan(port);
    setDeepSearching(false);
    if (found) {
      await applyServer(found);
      navigate('/login');
    } else {
      setDeepError('El barrido /24 no encontró el servidor. Revisa la red o usa la IP manual.');
    }
  }, [manualPort, navigate, setLastError]);

  /* Abre el wizard de activación de licencia (AppRoutes lo renderiza con
     licenseState='expired'), útil cuando el login falla por licencia. */
  const handleActivateLicense = useCallback(() => {
    useAuthStore.setState({licenseState: 'expired'});
  }, []);

  /* ── 3B) QR (placeholder) ─────────────────────────────────────────── */
  const handleQrPairing = () => {
    toast.info('Emparejamiento QR: próximamente en próxima iteración.');
  };

  /* ── 3) ESTADO DE UI ──────────────────────────────────────────────── */
  const serverDown = status === 'failed' && !searching;

  return (
    <GlassBackground>
      <div className="p-6 max-w-md w-full">
        {/* Encabezado */}
        <GlassSurface className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--color-text)] text-center mb-2">
            Sistema POS
          </h1>
          <p className="text-base text-[var(--color-text-secondary)] text-center">
            Buscando servidor en la red local…
          </p>
        </GlassSurface>

        {/* Banner de error: servidor caído */}
        {serverDown && (
          <GlassSurface className="mb-4 rounded-md p-4 bg-[var(--color-danger-soft)]">
            <h3 className="font-medium text-[var(--color-danger)] text-center mb-2">
              Servidor no disponible
            </h3>
            <p className="text-small text-[var(--color-danger)] text-center">
              Reintentando automáticamente cada 5 segundos
            </p>
          </GlassSurface>
        )}

        {/* Banner de error: último error de conexión manual */}
        {lastError && (
          <GlassSurface className="mb-4 rounded-md p-4 bg-[var(--color-danger-soft)]">
            <p className="text-small text-[var(--color-danger)] text-center">{lastError}</p>
          </GlassSurface>
        )}

        {/* Banner: barrido /24 sin resultados */}
        {deepError && (
          <GlassSurface className="mb-4 rounded-md p-4 bg-[var(--color-danger-soft)]">
            <p className="text-small text-[var(--color-danger)] text-center">{deepError}</p>
          </GlassSurface>
        )}

        {/* Botón de búsqueda */}
        <GlassSurface className="mb-4 p-4" style={{backgroundColor: 'var(--color-primary-soft)'}}>
          <POSButton
            title={searching ? 'Buscando servidor…' : 'Buscar servidor'}
            onPress={runDiscovery}
            loading={searching}
            large
            data-testid="btn-buscar-servidor"
          />
        </GlassSurface>

        {/* Divider */}
        <div className="border-t border-[var(--color-border)] my-6"></div>

        {/* Conexión manual */}
        <GlassSurface className="rounded-md p-4" style={{backgroundColor: 'var(--color-surface)'}}>
          <h3 className="font-medium text-[var(--color-text)] mb-3">Conexión manual</h3>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="IP del servidor"
              className="w-full rounded-md p-3 border border-[var(--color-border)] bg-[var(--color-input)] text-[var(--color-text)] focus-outline-none"
              value={manualIp}
              onInput={(e: React.FormEvent<HTMLInputElement>) => setManualIp(e.currentTarget.value)}
            />
            <input
              type="number"
              placeholder="Puerto"
              className="w-full rounded-md p-3 border border-[var(--color-border)] bg-[var(--color-input)] text-[var(--color-text)] focus-outline-none"
              value={manualPort}
              onInput={(e: React.FormEvent<HTMLInputElement>) => setManualPort(e.currentTarget.value)}
            />
            <POSButton
              title="Conectar con IP manual"
              onPress={handleManualConnect}
              variant="secondary"
              data-testid="btn-ip-manual"
            />
            <POSButton
              title={deepSearching ? 'Barriendo la red…' : 'Búsqueda profunda (barrido /24)'}
              onPress={handleDeepSearch}
              loading={deepSearching}
              variant="ghost"
              data-testid="btn-busqueda-profunda"
            />
          </div>
        </GlassSurface>

        {/* Licencia: abre el wizard de activación/renovación */}
        <GlassSurface className="mt-6 rounded-md p-4" style={{backgroundColor: 'var(--color-surface)'}}>
          <h3 className="font-medium text-[var(--color-text)] mb-3">Licencia</h3>
          <p className="text-small text-[var(--color-text-secondary)] mb-3">
            Si el servidor reporta licencia vencida o inválida, carga aquí el archivo .lic.
          </p>
          <POSButton
            title="Activar / renovar licencia"
            onPress={handleActivateLicense}
            variant="secondary"
            data-testid="btn-activar-licencia"
          />
        </GlassSurface>

        {/* Emparejamiento QR */}
        <GlassSurface className="mt-6 p-4" style={{backgroundColor: 'var(--color-surface)'}}>
          <h3 className="font-medium text-[var(--color-text)] mb-3">Emparejamiento por QR</h3>
          <p className="text-small text-[var(--color-text-secondary)]">
            Escanear código QR de emparejamiento (próximo).
          </p>
          <POSButton
            title="Escanear código QR de emparejamiento"
            variant="ghost"
            onPress={handleQrPairing}
          />
        </GlassSurface>
      </div>
    </GlassBackground>
  );
}