/**
 * navigation/AppRoutes.tsx — Enrutamiento raíz (react-router 7).
 *
 * Replica la lógica del stack de pos-mobil (navigation/index.windows.tsx):
 *   - Licencia vencida  → bloqueo total.
 *   - Sesión activa     → dashboard + recibo.
 *   - Sin sesión        → conexión → login.
 *
 * Las pantallas reales se portan en F4; mientras tanto se usan placeholders
 * ligeros para mantener el arranque y el splash verificado.
 */
import {Routes, Route, Navigate} from 'react-router-dom';
import {useAuthStore} from '../stores/auth.store';

/* ── Placeholders temporales (se reemplazan en F4) ────────────────────── */
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
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const licenseState = useAuthStore(state => state.licenseState);

  if (licenseState === 'expired') {
    return (
      <Routes>
        <Route path="*" element={<Placeholder title="Licencia vencida" />} />
      </Routes>
    );
  }

  if (isAuthenticated) {
    return (
      <Routes>
        <Route path="/" element={<Placeholder title="Dashboard" />} />
        <Route path="/receipt/:saleId" element={<Placeholder title="Recibo" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // Sin sesión: arranque de conexión → login.
  return (
    <Routes>
      <Route path="/" element={<Placeholder title="Conectar servidor" />} />
      <Route path="/login" element={<Placeholder title="Iniciar sesión" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}