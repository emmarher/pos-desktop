/**
 * components/TopAppBar.tsx — Barra superior (spec 3.1).
 *
 * Portado de pos-mobile a React DOM/Tailwind. Avatar + título. El avatar
 * abre el menú de usuario (dropdown) con la info de la cuenta/sesión
 * (nombre, rol, tenant, licencia) y la acción de cierre de sesión.
 */
import {useEffect, useRef, useState} from 'react';
import {LogOut, ChevronDown, ArrowLeft, KeyRound} from 'lucide-react';
import {useAuthStore} from '../stores/auth.store';
import {getLicenseStatus, uploadLicense} from '../api/endpoints';
import {ApiError} from '../api/client';
import AsyncStorage from '../lib/storage';
import {STORAGE_LICENSE_EXPIRY} from '../constants/app';

interface TopAppBarProps {
  title: string;
  /** Acción del menú (logout). Se invoca al pulsar "Cerrar sesión". */
  onLogout?: () => void;
  /** Acción de retroceso. Si se define, se muestra botón "<" a la izquierda (pantallas secundarias). */
  onBack?: () => void;
}

const LICENSE_LABEL: Record<string, string> = {
  active: 'Licencia activa',
  grace: 'Gracia',
  expired: 'Vencida',
  unknown: 'Desconocido',
};

export default function TopAppBar({title, onLogout, onBack}: TopAppBarProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const user = useAuthStore(s => s.user);
  const tenant = useAuthStore(s => s.tenant);
  const license = useAuthStore(s => s.license);
  const licenseState = useAuthStore(s => s.licenseState);
  // Renovación de licencia dentro del menú (F-I2c: trial→extendida sin salir).
  const [renewOpen, setRenewOpen] = useState(false);
  const [paste, setPaste] = useState('');
  const [renewBusy, setRenewBusy] = useState(false);
  const [renewMsg, setRenewMsg] = useState<string | null>(null);
  const [renewOk, setRenewOk] = useState(false);

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

  /* Lee un .lic con el file picker nativo (sin depender de plugins Tauri). */
  const handlePickFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.lic,text/plain';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setPaste(String(reader.result ?? ''));
      reader.readAsText(file);
    };
    input.click();
  };

  /* Sube el .lic (renovación/ampliación) y refresca el estado local. */
  const handleRenew = async () => {
    const content = paste.trim();
    if (!content.includes('.')) {
      setRenewOk(false);
      setRenewMsg('Formato inválido: se espera payload.firma (base64url).');
      return;
    }
    setRenewBusy(true);
    setRenewMsg(null);
    try {
      await uploadLicense(content);
      // Releer estado canónico y reflejarlo en store + caché de expiración.
      const status = await getLicenseStatus();
      // El server aplica también licencias vencidas (200 + status expired):
      // mostrarlo como error, sin tocar el estado local.
      if (status.status === 'expired') {
        setRenewOk(false);
        setRenewMsg(
          `La licencia subida está vencida desde ${new Date(status.expires_at).toLocaleDateString('es-MX')}. Pide una renovación a tu proveedor.`,
        );
        return;
      }
      useAuthStore.setState({
        license: {
          status: status.status,
          expires_at: status.expires_at,
          max_devices: status.max_devices,
        },
        licenseState: status.status,
        error: null,
      });
      await AsyncStorage.setItem(STORAGE_LICENSE_EXPIRY, status.expires_at);
      setRenewOk(true);
      setRenewMsg(
        `Licencia actualizada — vence ${new Date(status.expires_at).toLocaleDateString('es-MX')}.`,
      );
      setPaste('');
    } catch (err) {
      setRenewOk(false);
      setRenewMsg(
        err instanceof ApiError ? err.message : 'No se pudo subir la licencia.',
      );
    } finally {
      setRenewBusy(false);
    }
  };

  return (
    <header className="relative z-40 flex h-16 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 backdrop-blur-[var(--glass-blur)]">
      <div className="flex items-center gap-3">
        {/* Botón de retroceso: solo en pantallas secundarias que pasan onBack. */}
        {onBack && (
          <button
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-text)] transition-colors hover:bg-[var(--color-primary-soft)]"
            onClick={onBack}
            aria-label="Regresar"
            data-testid="appbar-back"
          >
            <ArrowLeft size={20} />
          </button>
        )}
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
          <div className="absolute right-12 top-1 z-50 w-64 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-solid)] shadow-lg">
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
              {/* Renovación trial→extendida sin salir de la app (F-I2c) */}
              <button
                className="mt-2 flex items-center gap-1 text-[var(--font-small)] font-semibold text-[var(--color-primary)] hover:underline"
                onClick={() => {
                  setRenewOpen(o => !o);
                  setRenewMsg(null);
                }}
                data-testid="btn-license-renew"
              >
                <KeyRound size={14} /> Renovar / subir licencia
              </button>
              {renewOpen && (
                <div className="mt-2">
                  <textarea
                    value={paste}
                    onChange={e => setPaste(e.target.value)}
                    placeholder="base64url(payload).base64url(firma)"
                    rows={3}
                    spellCheck={false}
                    className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] p-2 font-mono text-[var(--font-micro)] text-[var(--color-text)] outline-none"
                    data-testid="input-license-renew"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-2 py-1.5 text-[var(--font-small)] font-medium text-[var(--color-text)]"
                      onClick={handlePickFile}
                      disabled={renewBusy}
                      data-testid="btn-license-pick"
                    >
                      Elegir .lic
                    </button>
                    <button
                      className="flex-1 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-2 py-1.5 text-[var(--font-small)] font-semibold text-[var(--color-on-primary)] disabled:opacity-50"
                      onClick={handleRenew}
                      disabled={renewBusy || !paste.trim()}
                      data-testid="btn-license-upload"
                    >
                      {renewBusy ? 'Subiendo…' : 'Subir'}
                    </button>
                  </div>
                  {renewMsg && (
                    <p
                      className={`mt-2 text-[var(--font-micro)] font-medium ${renewOk ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}
                    >
                      {renewMsg}
                    </p>
                  )}
                </div>
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