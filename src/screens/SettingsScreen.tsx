/**
 * screens/SettingsScreen.tsx — Ajustes del comercio (settings:manage).
 *
 * Sube/reemplaza el logo y edita datos de contacto y pie de ticket.
 * El NOMBRE de la tienda es de solo lectura: viene de la licencia (D1).
 */
import {useCallback, useEffect, useRef, useState} from 'react';
import {Store} from 'lucide-react';
import BottomNavBar, {NavTab} from '../components/BottomNavBar';
import TopAppBar from '../components/TopAppBar';
import GlassSurface from '../components/GlassSurface';
import POSButton from '../components/POSButton';
import {ApiError} from '../api/client';
import {
  deleteMerchantLogo,
  getTenantSettings,
  IMAGE_MAX_SIZE_BYTES,
  IMAGE_MIME_TYPES,
  updateTenantSettings,
  uploadMerchantLogo,
} from '../api/endpoints';
import type {TenantSettingsData} from '../api/endpoints';
import {useResolvedImageUrl} from '../lib/images';
import {useAuthStore} from '../stores/auth.store';
import AsyncStorage from '../lib/storage';
import {STORAGE_TENANT} from '../constants/app';
import {toast} from '../hooks/useToast';

interface SettingsScreenProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onLogout?: () => void;
  visibleTabs?: NavTab[];
}

/** Campo de texto con etiqueta, reutilizado en el formulario. */
function Field({
  label,
  value,
  onChange,
  placeholder,
  testID,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  testID?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[var(--font-micro)] font-semibold text-[var(--color-text-secondary)]">
        {label}
      </span>
      <input
        className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-[var(--font-regular)] text-[var(--color-text)] outline-none"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        data-testid={testID}
      />
    </label>
  );
}

export default function SettingsScreen({
  activeTab,
  onTabChange,
  onLogout,
  visibleTabs,
}: SettingsScreenProps) {
  const license = useAuthStore(s => s.license);
  const tenant = useAuthStore(s => s.tenant);
  const [settings, setSettings] = useState<TenantSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Campos editables (el nombre no: lo manda la licencia)
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [rfc, setRfc] = useState('');
  const [ticketHeader, setTicketHeader] = useState('');
  const [footer, setFooter] = useState('');

  // Logo: archivo local (preview) o URL del backend
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const remoteLogo = useResolvedImageUrl(settings?.logo_url);
  const logoSrc = logoPreview ?? remoteLogo;

  /** Refleja cambios del comercio en el store para navbar y ticket. */
  const patchTenant = async (patch: Record<string, unknown>) => {
    if (!tenant) return;
    const next = {...tenant, ...patch};
    useAuthStore.setState({tenant: next});
    await AsyncStorage.setItem(STORAGE_TENANT, JSON.stringify(next));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTenantSettings();
      setSettings(data);
      setAddress(data.address ?? '');
      setPhone(data.phone ?? '');
      setEmail(data.email ?? '');
      setRfc(data.rfc ?? '');
      setTicketHeader(data.ticket_header ?? '');
      setFooter(data.receipt_footer ?? '');
    } catch (err) {
      // El error real (red/permiso) debe ser visible y reintentable.
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Liberar el object URL del preview al desmontar.
  useEffect(() => {
    return () => {
      if (logoPreview?.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  /** Valida MIME/tamaño y sube el logo inmediatamente. */
  const handlePickLogo = async (file: File | undefined | null) => {
    if (!file) return;
    const mimeOk = (IMAGE_MIME_TYPES as readonly string[]).includes(file.type);
    if (!mimeOk) {
      toast.error('Formato no permitido. Usa JPG, PNG o WebP.');
      return;
    }
    if (file.size > IMAGE_MAX_SIZE_BYTES) {
      toast.error('La imagen supera el límite de 5 MB.');
      return;
    }

    setLogoPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const bytes = await file.arrayBuffer();
      const res = await uploadMerchantLogo({name: file.name, mime: file.type, bytes});
      // La URL remota ya incluye cache-busting por uuid; se refleja en la UI.
      setSettings(prev => (prev ? {...prev, logo_url: res.logo_url} : prev));
      await patchTenant({logo_url: res.logo_url});
      toast.success('Logo actualizado.');
    } catch (err) {
      // No dejar un preview que no se guardó.
      setLogoPreview(null);
      toast.error(err instanceof ApiError ? err.message : 'No se pudo subir el logo.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    setUploading(true);
    try {
      await deleteMerchantLogo();
      setSettings(prev => (prev ? {...prev, logo_url: null} : prev));
      setLogoPreview(null);
      await patchTenant({logo_url: null});
      toast.success('Logo eliminado.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar el logo.');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await updateTenantSettings({
        address: address.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        rfc: rfc.trim() || null,
        ticket_header: ticketHeader.trim() || null,
        receipt_footer: footer.trim() || null,
      });
      setSettings(data);
      await patchTenant({
        address: data.address,
        phone: data.phone,
        receipt_footer: data.receipt_footer,
      });
      toast.success('Configuración guardada.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-[var(--color-background)]">
      <TopAppBar title="Ajustes" onLogout={onLogout} />

      <div className="flex-1 space-y-4 overflow-y-auto p-4 pb-24">
        {loading ? (
          <p className="py-6 text-center text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
            Cargando configuración…
          </p>
        ) : error ? (
          <div className="py-6 text-center">
            <p className="mb-2 text-[var(--font-regular)] font-semibold text-[var(--color-danger)]">
              {error}
            </p>
            <POSButton title="Reintentar" onPress={() => void load()} />
          </div>
        ) : (
          <>
            {/* ── Logo y nombre del comercio ─────────────────────────── */}
            <GlassSurface>
              <h3 className="mb-3 text-[var(--font-medium)] font-bold text-[var(--color-text)]">
                Comercio
              </h3>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)]">
                  {logoSrc ? (
                    <img
                      src={logoSrc}
                      alt="Logo del comercio"
                      className="h-full w-full object-contain"
                      data-testid="settings-logo"
                    />
                  ) : (
                    <Store size={28} className="text-[var(--color-text-secondary)]" />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={e => void handlePickLogo(e.target.files?.[0])}
                    data-testid="settings-logo-input"
                  />
                  <POSButton
                    title={uploading ? 'Subiendo…' : settings?.logo_url ? 'Reemplazar' : 'Subir logo'}
                    variant="secondary"
                    loading={uploading}
                    onPress={() => fileInputRef.current?.click()}
                    data-testid="settings-logo-upload"
                  />
                  {settings?.logo_url && (
                    <POSButton
                      title="Quitar"
                      variant="danger"
                      onPress={() => void handleRemoveLogo()}
                      disabled={uploading}
                    />
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <p className="text-[var(--font-regular)] font-semibold text-[var(--color-text)]">
                  {license?.customer?.trim() || settings?.display_name || 'Sin nombre'}
                </p>
                <span className="rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-[var(--font-micro)] font-semibold text-[var(--color-primary)]">
                  Definido por la licencia
                </span>
              </div>
              <p className="mt-1 text-[var(--font-micro)] text-[var(--color-text-secondary)]">
                Para cambiar el nombre, sube una licencia emitida con el nombre comercial.
              </p>
            </GlassSurface>

            {/* ── Datos de contacto y ticket ─────────────────────────── */}
            <GlassSurface>
              <h3 className="mb-3 text-[var(--font-medium)] font-bold text-[var(--color-text)]">
                Datos del ticket
              </h3>
              <div className="grid gap-3">
                <Field label="Dirección" value={address} onChange={setAddress} testID="settings-address" />
                <Field label="Teléfono" value={phone} onChange={setPhone} testID="settings-phone" />
                <Field label="Email" value={email} onChange={setEmail} testID="settings-email" />
                <Field label="RFC" value={rfc} onChange={setRfc} testID="settings-rfc" />
                <Field
                  label="Encabezado del ticket"
                  value={ticketHeader}
                  onChange={setTicketHeader}
                  testID="settings-ticket-header"
                />
                <Field
                  label="Pie del ticket"
                  value={footer}
                  onChange={setFooter}
                  testID="settings-footer"
                />
              </div>
              <div className="mt-4 flex justify-end">
                <POSButton
                  title={saving ? 'Guardando…' : 'Guardar cambios'}
                  loading={saving}
                  onPress={() => void handleSave()}
                  data-testid="settings-save"
                />
              </div>
            </GlassSurface>
          </>
        )}
      </div>

      <BottomNavBar active={activeTab} onChange={onTabChange} visibleTabs={visibleTabs} />
    </div>
  );
}
