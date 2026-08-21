/**
 * screens/LoginScreen.tsx — Login de dispositivo (RF-AU-002).
 *
 * Portado de pos-mobil a React DOM + Tailwind + react-router.
 * Envía POST /auth/login vía Rust (api_request); persiste la sesión y
 * navega al Dashboard. Incluye fallback a la pantalla de conexión.
 */
import {useCallback, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAuthStore} from '../stores/auth.store';
import {login} from '../api/endpoints';
import {ApiError} from '../api/client';
import {getOrCreateDeviceId, getDeviceName, getDeviceType} from '../lib/platform';
import GlassBackground from '../components/GlassBackground';
import GlassSurface from '../components/GlassSurface';
import POSButton from '../components/POSButton';

export default function LoginScreen() {
  const navigate = useNavigate();
  const setSession = useAuthStore(state => state.setSession);

  const [tenantCode, setTenantCode] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = useCallback(async () => {
    if (!tenantCode.trim() || !pin.trim()) {
      setError('Ingresa código de tenant y PIN.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // ID de dispositivo estable (RF-AU-004) — evita DEVICE_LIMIT
      const deviceId = await getOrCreateDeviceId();
      const auth = await login({
        tenant_code: tenantCode.trim(),
        pin: pin.trim(),
        device_id: deviceId,
        device_name: getDeviceName(),
        device_type: getDeviceType(),
      });
      await setSession(auth);
      navigate('/', {replace: true});
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setLoading(false);
    }
  }, [tenantCode, pin, navigate, setSession]);

  return (
    <GlassBackground>
      <div className="flex min-h-full w-full items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Logo + título */}
          <div className="mb-8 flex flex-col items-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-on-primary)]">
              <span className="text-[var(--font-xlarge)] font-black">POS</span>
            </div>
            <h1 className="text-[var(--font-xlarge)] font-extrabold text-[var(--color-text)]">
              Sistema POS
            </h1>
            <p className="mt-1 text-[var(--font-regular)] text-[var(--color-text-secondary)]">
              Punto de venta v4
            </p>
          </div>

          {/* Formulario glass */}
          <GlassSurface className="rounded-[var(--radius-xl)] p-6">
            <label className="mb-1 block text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
              ID de operador
            </label>
            <input
              type="text"
              className="mb-4 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] p-3 text-[var(--color-text)] outline-none"
              placeholder="Código de tenant"
              value={tenantCode}
              onChange={e => setTenantCode(e.target.value)}
              autoCapitalize="characters"
              data-testid="input-tenant-code"
            />

            <label className="mb-1 block text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
              PIN
            </label>
            <input
              type="password"
              className="mb-4 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] p-3 text-[var(--color-text)] outline-none"
              placeholder="PIN (4-6 dígitos)"
              value={pin}
              onChange={e => setPin(e.target.value)}
              maxLength={6}
              data-testid="input-pin"
            />

            {error && (
              <p className="mb-3 text-center text-[var(--font-small)] font-medium text-[var(--color-danger)]">
                {error}
              </p>
            )}

            {/* Acción principal: "Autenticar →" */}
            <POSButton
              title={loading ? 'Validando…' : 'Autenticar →'}
              onPress={handleLogin}
              loading={loading}
              large
              data-testid="btn-login"
            />

            <div className="mt-4 text-center">
              <button
                className="text-[var(--font-small)] font-medium text-[var(--color-primary)] hover:underline"
                onClick={() => navigate('/')}
                data-testid="btn-back-connection"
              >
                ¿Cambiar servidor?
              </button>
            </div>
          </GlassSurface>
        </div>
      </div>
    </GlassBackground>
  );
}
