/**
 * components/TopAppBar.tsx — Barra superior (spec 3.1).
 *
 * Portado de pos-mobile a React DOM/Tailwind. Avatar + título. El avatar
 * abre el menú de usuario (dropdown) con la info de la cuenta/sesión
 * (nombre, rol, tenant, licencia) y la acción de cierre de sesión.
 */
import {useEffect, useRef, useState} from 'react';
import {LogOut, ChevronDown} from 'lucide-react';
import {useAuthStore} from '../stores/auth.store';

interface TopAppBarProps {
  title: string;
  /** Acción del menú (logout). Se invoca al pulsar "Cerrar sesión". */
  onLogout?: () => void;
}

const LICENSE_LABEL: Record<string, string> = {
  active: 'Licencia activa',
  grace: 'Gracia',
  expired: 'Vencida',
  unknown: 'Desconocido',
};

export default function TopAppBar({title, onLogout}: TopAppBarProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const user = useAuthStore(s => s.user);
  const tenant = useAuthStore(s => s.tenant);
  const license = useAuthStore(s => s.license);
  const licenseState = useAuthStore(s => s.licenseState);

  // Inicial del usuario para el avatar (fallback 'U')
  const initial = (user?.name?.trim()?.charAt(0) ?? 'U').toUpperCase();
  const role = user?.role_name ? ` · ${user.role_name}` : '';

  /* Cerrar el dropdown al hacer click fuera */
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const handleLogout = () => {
    setOpen(false);
    onLogout?.();
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 backdrop-blur-[var(--glass-blur)]">
      <div className="flex items-center gap-3">
        <h1 className="truncate text-[var(--font-medium)] font-bold text-[var(--color-text)]">
          {title}
        </h1>
      </div>

      {/* Avatar + menú */}
      <div className="relative" ref={ref}>
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary)] text-base font-bold text-[var(--color-on-primary)] transition-transform hover:scale-105"
          onClick={() => setOpen(o => !o)}
          data-testid="appbar-avatar"
        >
          {initial}
          <ChevronDown
            size={12}
            className="absolute -bottom-0.5 -right-0.5 rounded-full bg-[var(--color-surface-solid)] text-[var(--color-primary)]"
          />
        </button>

        {open && (
          <div className="absolute right-0 top-12 z-40 w-64 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-solid)] shadow-lg">
            <div className="border-b border-[var(--color-border)] p-4">
              <p className="truncate text-[var(--font-regular)] font-bold text-[var(--color-text)]">
                {user?.name ?? 'Usuario'}
              </p>
              <p className="text-[var(--font-small)] text-[var(--color-text-secondary)]">
                {role || 'Sin rol'}
              </p>
              {tenant && (
                <p className="mt-1 text-[var(--font-small)] text-[var(--color-text-secondary)]">
                  {tenant.business_name}
                </p>
              )}
            </div>
            <div className="border-b border-[var(--color-border)] p-4">
              <p
                className={`text-[var(--font-small)] font-semibold ${
                  licenseState === 'expired'
                    ? 'text-[var(--color-danger)]'
                    : licenseState === 'grace'
                      ? 'text-[var(--color-warning)]'
                      : 'text-[var(--color-success)]'
                }`}
              >
                {license ? LICENSE_LABEL[license.status] ?? 'Licencia' : 'Licencia'}
              </p>
              {license?.expires_at && (
                <p className="text-[var(--font-micro)] text-[var(--color-text-secondary)]">
                  Vence: {new Date(license.expires_at).toLocaleDateString('es-MX')}
                </p>
              )}
            </div>
            <button
              className="flex w-full items-center gap-2 px-4 py-3 text-[var(--font-regular)] font-semibold text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger-soft)]"
              onClick={handleLogout}
              data-testid="btn-logout"
            >
              <LogOut size={16} /> Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </header>
  );
}