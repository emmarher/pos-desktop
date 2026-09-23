/**
 * screens/LicenseActivation.tsx — Wizard primera ejecución (bootstrap).
 *
 * Flujos:
 *   1) Drag & drop del .lic (o "Seleccionar archivo .lic" via Tauri dialog + FS)
 *   2) Paste del contenido base64url.payload.sig en textarea
 *   3) Botón "Probar 1 día gratis" → POST /license/trial (familia trial aislada)
 *
 * Endpoints (bootstrap-aware, sin JWT si falta licencia):
 *   POST /license/upload  { license_data }
 *   POST /license/trial
 *   GET  /license/status  (para verificar después)
 *
 * UX optimizada (AGENTS.md): feedback inmediato, drag highlight, disabled durante envío,
 * errores no bloqueantes, sin re-renders extra (local state memoizado), sin crasheo en I/O.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { apiRequest, ApiError, isNetworkError } from '../api/client';
import { useServerStore } from '../stores/server.store';
import { useAuthStore } from '../stores/auth.store';

type StatusKind = 'idle' | 'loading' | 'success' | 'error';

export default function LicenseActivation({ onActivated }: { onActivated?: () => void }) {
  const [paste, setPaste] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [statusKind, setStatusKind] = useState<StatusKind>('idle');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const server = useServerStore(s => s.server);
  const refreshLicense = useCallback(async () => {
    try {
      const res = await apiRequest<{ status: string; expires_at: string; lic_id: string | null }>(
        '/license/status',
        { method: 'GET', auth: false },
      );
      void res;
    } catch {
      // best-effort
    }
  }, []);

  const activateWithContent = useCallback(async (licContent: string, source: string) => {
    const trimmed = licContent.trim();
    if (!trimmed) {
      setStatusKind('error');
      setStatusMsg('El contenido de la licencia está vacío.');
      return;
    }
    if (!trimmed.includes('.')) {
      setStatusKind('error');
      setStatusMsg('Formato inválido: se espera payload.firma (base64url).');
      return;
    }
    setStatusKind('loading');
    setStatusMsg('Validando licencia…');
    try {
      const result = await apiRequest<{ lic_id: string; expires_at: string; status: string }>('/license/upload', {
        method: 'POST',
        body: { license_data: trimmed },
        auth: false,
      });
      setStatusKind('success');
      setStatusMsg(`Licencia activada: ${String((result as unknown as { lic_id?: string })?.lic_id ?? source)} — expira ${String((result as unknown as { expires_at?: string })?.expires_at ?? '')}`);
      await refreshLicense();
      // Actualizar store de licencia para que AppRoutes salga del wizard
      try {
        useAuthStore.setState({ licenseState: 'active' as const });
      } catch {}
      onActivated?.();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : String(err));
      if (isNetworkError(err)) {
        setStatusKind('error');
        setStatusMsg(`No se pudo conectar con el servidor${server?.ip ? ` (${server.ip}:${server?.port ?? 3000})` : ''}. Verifica que el POS Server esté encendido. Detalle: ${msg}`);
      } else {
        setStatusKind('error');
        setStatusMsg(msg || 'Licencia inválida. Contacte a soporte.');
      }
    }
  }, [onActivated, refreshLicense, server?.ip, server?.port]);

  const handleTrial = useCallback(async () => {
    setStatusKind('loading');
    setStatusMsg('Generando licencia trial de 1 día…');
    try {
      const result = await apiRequest<{ expires_at: string; lic_id: string }>('/license/trial', {
        method: 'POST',
        auth: false,
      });
      setStatusKind('success');
      setStatusMsg(`Trial activado (1 día): ${(result as unknown as { lic_id?: string })?.lic_id ?? 'trial'} — expira ${String((result as unknown as { expires_at?: string })?.expires_at ?? '')}`);
      await refreshLicense();
      try { useAuthStore.setState({ licenseState: 'active' as const }); } catch {}
      onActivated?.();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : String(err));
      setStatusKind('error');
      setStatusMsg(isNetworkError(err)
        ? `Servidor no disponible${server?.ip ? ` (${server.ip})` : ''}: ${msg}`
        : (msg || 'No se pudo generar el trial.'));
    }
  }, [onActivated, refreshLicense, server?.ip]);

  const handlePickFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Licencia POS', extensions: ['lic'] }],
      });
      if (!selected || typeof selected !== 'string') {
        if (Array.isArray(selected) && selected[0]) {
          const first = selected[0] as string;
          const content = await readTextFile(first);
          setFileName(first.split('/').pop()?.split('\\').pop() ?? first);
          await activateWithContent(content, first);
          return;
        }
        return;
      }
      const content = await readTextFile(selected);
      setFileName(selected.split('/').pop()?.split('\\').pop() ?? selected);
      await activateWithContent(content, selected);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Si el usuario canceló, no mostrar error
      if (/cancel/i.test(msg)) return;
      setStatusKind('error');
      setStatusMsg(`No se pudo leer el archivo: ${msg}`);
    }
  }, [activateWithContent]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file) return;
    // Validar extensión superficialmente
    if (!file.name.endsWith('.lic') && !file.name.endsWith('.txt')) {
      setStatusKind('error');
      setStatusMsg('El archivo debe ser .lic');
      return;
    }
    try {
      const text = await file.text();
      setFileName(file.name);
      await activateWithContent(text, file.name);
    } catch (err) {
      setStatusKind('error');
      setStatusMsg(`No se pudo leer el archivo soltado: ${String(err)}`);
    }
  }, [activateWithContent]);

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); }, []);

  // Accesibilidad: focus trap mínimo y soporte teclado para activar
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  // Verificar estado inicial de licencia para auto-ocultar wizard si ya hay licencia
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await apiRequest('/license/status', { method: 'GET', auth: false });
        if (!cancelled) {
          // Hay licencia: actualizar store y cerrar wizard
          useAuthStore.setState({ licenseState: 'active' as const });
          onActivated?.();
        }
      } catch (e) {
        if (e instanceof ApiError && (e.code === 'NO_LICENSE' || e.status === 404)) {
          // Sin licencia → wizard debe quedarse visible (no hacer nada)
          useAuthStore.setState({ licenseState: 'expired' as const });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [onActivated]);

  return (
    <div className="flex min-h-full w-full items-center justify-center bg-[var(--color-background)] p-4">
      <div className="w-full max-w-[560px] glass-surface p-6 sm:p-8 rounded-2xl shadow-lg border border-white/10">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-white/10 flex items-center justify-center text-lg">🔑</div>
          <div>
            <h1 className="text-[18px] font-semibold text-[var(--color-text)]">Activar licencia</h1>
            <p className="text-[12px] text-[var(--color-text-secondary)]">Primera ejecución — se requiere una licencia válida para operar.</p>
          </div>
        </div>

        {!server?.ip && (
          <div className="mt-4 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-200">
            Servidor no configurado. Ve a <span className="font-semibold">Conexión</span> para descubrir el POS Server (UDP :5000) o configura la IP manualmente antes de activar.
          </div>
        )}

        {/* Drop zone */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={handleDrop}
          className={`mt-5 flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${dragOver ? 'border-white/40 bg-white/5' : 'border-white/15 hover:border-white/25 bg-white/[0.02]'}`}
          aria-label="Zona para soltar archivo .lic"
        >
          <p className="text-sm text-[var(--color-text)]">Arrastra tu archivo <span className="font-mono">.lic</span> aquí</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">o</p>
          <button
            type="button"
            onClick={handlePickFile}
            className="mt-3 rounded-lg bg-white text-zinc-900 px-4 py-2 text-sm font-medium hover:bg-zinc-100 active:bg-zinc-200 disabled:opacity-50"
            disabled={statusKind === 'loading'}
          >
            Seleccionar archivo .lic
          </button>
          {fileName && <p className="mt-2 text-xs text-[var(--color-text-secondary)] truncate max-w-full">Archivo: <span className="font-mono">{fileName}</span></p>}
        </div>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs text-[var(--color-text-secondary)]">o pega el contenido</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <textarea
          ref={pasteRef}
          value={paste}
          onChange={e => setPaste(e.target.value)}
          placeholder="base64url(payload).base64url(firma) — pega el contenido del .lic"
          className="w-full min-h-[96px] rounded-xl bg-zinc-900/50 border border-white/10 px-3 py-2 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-white/25"
          rows={4}
          spellCheck={false}
          aria-label="Pegar licencia"
        />
        <div className="mt-3 flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => activateWithContent(paste, 'pegado')}
            disabled={!paste.trim() || statusKind === 'loading'}
            className="flex-1 min-w-[140px] rounded-lg bg-white text-zinc-900 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-100 disabled:opacity-50"
          >
            {statusKind === 'loading' ? 'Activando…' : 'Activar licencia'}
          </button>
          <button
            type="button"
            onClick={handleTrial}
            disabled={statusKind === 'loading'}
            className="rounded-lg border border-white/15 bg-white/5 text-white px-4 py-2.5 text-sm font-medium hover:bg-white/10 disabled:opacity-50"
          >
            Probar 1 día gratis
          </button>
        </div>

        {/* Estado */}
        {statusKind !== 'idle' && statusMsg && (
          <div
            role="status"
            className={`mt-4 rounded-lg border px-3 py-2 text-xs ${statusKind === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200' : statusKind === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-200' : 'bg-white/5 border-white/10 text-zinc-200'}`}
          >
            {statusMsg}
          </div>
        )}

        <p className="mt-4 text-[11px] leading-4 text-[var(--color-text-secondary)]">
          La licencia .lic es un archivo firmado Ed25519 (payload + firma). Si necesitas renovar, ampliar asientos o renovar tras 1 día, tu proveedor te emitirá un nuevo .lic. El trial usa una familia de claves aislada y no afecta licencias productivas.
        </p>
      </div>
    </div>
  );
}
