/**
 * navigation/AppRoutes.tsx — Enrutamiento raíz (react-router 7).
 *
 * Replica la lógica del stack de pos-mobil (navigation/index.windows.tsx):
 *   - Licencia vencida  → bloqueo total.
 *   - Sesión activa     → dashboard + recibo.
 *   - Sin sesión        → conexión → login.
 */
import {Routes, Route, Navigate} from 'react-router-dom';
import {useAuthStore} from '../stores/auth.store';
import ConnectionScreen from '../screens/ConnectionScreen';
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import HardwareScreen from '../screens/HardwareScreen';
import LicenseActivation from '../screens/LicenseActivation';
import ToastContainer from '../components/ToastContainer';

/* Probe bootstrap: si licenseState es unknown, consulta al server para decidir wizard vs conexión */
import { useEffect, useRef } from 'react';
import { apiRequest, ApiError } from '../api/client';

function useBootstrapLicenseProbe() {
  const licenseState = useAuthStore(s => s.licenseState);
  const probed = useRef(false);
  useEffect(() => {
    if (licenseState !== 'unknown' || probed.current) return;
    probed.current = true;
    (async () => {
      try {
        await apiRequest('/license/status', { method: 'GET', auth: false });
        useAuthStore.setState({ licenseState: 'active' as const });
      } catch (e) {
        if (e instanceof ApiError && (e.code === 'NO_LICENSE' || e.status === 404)) {
          useAuthStore.setState({ licenseState: 'expired' as const });
        } else {
          // Sin servidor o error de red → no bloquear login; dejar en active para que el usuario pueda intentar conectar
          // El wizard interno reintentará cuando haya conexión
        }
      }
    })();
  }, [licenseState]);
}

/* ── Placeholder temporal (se reemplazan en F4 las pantallas restantes) ── */
function Placeholder({title}: {title: string}) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--color-background)]">
      <div className="glass-surface px-8 py-6">
        <h2 className="text-[var(--font-large)] font-semibold text-[var(--color-text)]">{title}</h2>
        <p className="mt-1 text-[var(--font-small)] text-[var(--color-text-secondary)]">
          Pantalla en porte — Fase 4
        </p>
      </div>
    </div>
  );
}

export default function AppRoutes() {
  useBootstrapLicenseProbe();
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const licenseState = useAuthStore(state => state.licenseState);

  if (licenseState === 'expired') {
    return (
      <>
        <Routes>
          <Route
            path="*"
            element={
              <LicenseActivation
                onActivated={() => {
                  // El wizard ya puso licenseState='active'; el router re-evalúa en próximo render
                }}
              />
            }
          />
        </Routes>
        <ToastContainer />
      </>
    );
  }

  if (isAuthenticated) {
    return (
      <>
        <Routes>
          <Route path="/" element={<DashboardScreen />} />
          <Route path="/hardware" element={<HardwareScreen />} />
          <Route path="/receipt/:saleId" element={<Placeholder title="Recibo" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ToastContainer />
      </>
    );
  }

  // Sin sesión: arranque de conexión UDP → login (manual/IP).
  return (
    <>
      <Routes>
        <Route path="/" element={<ConnectionScreen />} />
        <Route path="/login" element={<LoginScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastContainer />
    </>
  );
}