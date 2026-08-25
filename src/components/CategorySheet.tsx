/**
 * components/CategorySheet.tsx — Gestión de categorías (RF-CA-001).
 *
 * Sheet con dos vistas: LISTA (categorías con color, prefijo y conteo de
 * productos, botón editar) y FORMULARIO (crear/editar: nombre*, prefijo*,
 * color y descripción). Usa POST /categories y PATCH /categories/:id
 * — el padre decide si lo muestra según el permiso categories:manage.
 * Errores vía toast; la lista se recarga localmente tras cada guardado.
 */
import {useCallback, useEffect, useState} from 'react';
import {Pencil, X} from 'lucide-react';
import type {Category} from '../models';
import {
  createCategory,
  getCategories,
  updateCategory,
  type CategoryInput,
} from '../api/endpoints';
import {ApiError} from '../api/client';
import {toast} from '../hooks/useToast';
import POSButton from './POSButton';

interface CategorySheetProps {
  onClose: () => void;
  /** Notifica al padre que las categorías cambiaron (recarga chips). */
  onChanged: () => void;
}

/** Estado interno: lista o formulario (create/edit). */
type ViewState =
  | {kind: 'list'}
  | {kind: 'form'; mode: 'create' | 'edit'; initial?: Category | null};

/** Extrae un mensaje legible de cualquier error. */
function errMsg(err: unknown): string {
  return err instanceof ApiError ? err.message : String(err);
}

/** Paleta rápida para elegir color de categoría. */
const COLOR_SWATCHES = [
  '#22C55E',
  '#3B82F6',
  '#EF4444',
  '#06B6D4',
  '#F59E0B',
  '#A855F7',
  '#64748B',
  '#EC4899',
];

export default function CategorySheet({onClose, onChanged}: CategorySheetProps) {
  const [view, setView] = useState<ViewState>({kind: 'list'});

  /* Datos de la lista (se recargan al abrir y tras cada guardado) */
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** Carga la lista desde GET /categories. */
  const loadCategories = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setCategories(await getCategories());
    } catch (err) {
      setLoadError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  /* Campos del formulario */
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [color, setColor] = useState<string>('#22C55E');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /** Abre el formulario en modo crear (campos limpios). */
  const openCreate = useCallback(() => {
    setName('');
    setPrefix('');
    setColor(COLOR_SWATCHES[0]);
    setDescription('');
    setErrors({});
    setView({kind: 'form', mode: 'create'});
  }, []);

  /** Abre el formulario en modo editar con prefill. */
  const openEdit = useCallback((cat: Category) => {
    setName(cat.name);
    setPrefix(cat.prefix);
    setColor(cat.color ?? COLOR_SWATCHES[0]);
    setDescription(cat.description ?? '');
    setErrors({});
    setView({kind: 'form', mode: 'edit', initial: cat});
  }, []);

  /** Valida cliente y envía POST/PATCH; true si guardó. */
  const handleSave = useCallback(async () => {
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = 'El nombre es obligatorio.';
    if (!prefix.trim()) nextErrors.prefix = 'El prefijo es obligatorio.';
    else if (prefix.trim().length > 4) {
      nextErrors.prefix = 'Máximo 4 caracteres.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    const body: CategoryInput = {
      name: name.trim(),
      prefix: prefix.trim().toUpperCase(),
      description: description.trim() || null,
      color,
    };
    try {
      if (view.kind === 'form' && view.mode === 'edit' && view.initial) {
        await updateCategory(view.initial.id, body);
        toast.success('Categoría actualizada correctamente.');
      } else {
        await createCategory(body);
        toast.success('Categoría creada correctamente.');
      }
      onChanged();
      void loadCategories();
      setView({kind: 'list'});
    } catch (err) {
      toast.error(`Error al guardar: ${errMsg(err)}`);
    } finally {
      setSubmitting(false);
    }
  }, [name, prefix, color, view, onChanged, loadCategories]);

  /* ── VISTA FORMULARIO ─────────────────────────────────────────────── */
  if (view.kind === 'form') {
    const isEdit = view.mode === 'edit';
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
        <div
          className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-[var(--radius-xl)] bg-[var(--color-surface-solid)] p-6 pb-10"
          onClick={e => e.stopPropagation()}
        >
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-[var(--color-border)]" />
          <h2 className="mb-1 text-center text-[var(--font-medium)] font-extrabold text-[var(--color-text)]">
            {isEdit ? 'Editar categoría' : 'Nueva categoría'}
          </h2>

          {/* Nombre */}
          <label className="mb-1 mt-2 block text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
            Nombre *
          </label>
          <input
            className={`w-full rounded-[var(--radius-md)] border px-3 py-2.5 text-[var(--font-regular)] text-[var(--color-text)] outline-none ${
              errors.name
                ? 'border-[var(--color-danger)] bg-[var(--color-danger-soft)]/50'
                : 'border-[var(--color-border)] bg-[var(--color-input)]'
            }`}
            placeholder="Ej. Frutas y Verduras"
            value={name}
            onChange={e => {
              setName(e.target.value);
              if (errors.name) setErrors(prev => ({...prev, name: ''}));
            }}
            maxLength={100}
            data-testid="cat-name"
          />
          {errors.name && (
            <p className="mt-1 text-[var(--font-micro)] text-[var(--color-danger)]">{errors.name}</p>
          )}

          {/* Prefijo */}
          <label className="mb-1 mt-3 block text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
            Prefijo * (código interno, máx. 4)
          </label>
          <input
            className={`w-full rounded-[var(--radius-md)] border px-3 py-2.5 text-[var(--font-regular)] font-bold uppercase tracking-wide text-[var(--color-text)] outline-none ${
              errors.prefix
                ? 'border-[var(--color-danger)] bg-[var(--color-danger-soft)]/50'
                : 'border-[var(--color-border)] bg-[var(--color-input)]'
            }`}
            placeholder="Ej. FRV"
            value={prefix}
            onChange={e => {
              setPrefix(e.target.value.toUpperCase());
              if (errors.prefix) setErrors(prev => ({...prev, prefix: ''}));
            }}
            maxLength={4}
            data-testid="cat-prefix"
          />
          {errors.prefix && (
            <p className="mt-1 text-[var(--font-micro)] text-[var(--color-danger)]">{errors.prefix}</p>
          )}

          {/* Color */}
          <label className="mb-1 mt-3 block text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
            Color
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {COLOR_SWATCHES.map(c => (
              <button
                key={c}
                type="button"
                className={`h-8 w-8 rounded-full transition-transform ${
                  color === c ? 'scale-110 ring-2 ring-[var(--color-text)] ring-offset-2 ring-offset-[var(--color-surface-solid)]' : ''
                }`}
                style={{backgroundColor: c}}
                aria-label={`Color ${c}`}
                onClick={() => setColor(c)}
              />
            ))}
          </div>

          {/* Descripción */}
          <label className="mb-1 mt-3 block text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
            Descripción
          </label>
          <textarea
            className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2.5 text-[var(--font-regular)] text-[var(--color-text)] outline-none"
            rows={2}
            maxLength={500}
            placeholder="Opcional"
            value={description}
            onChange={e => setDescription(e.target.value)}
            data-testid="cat-description"
          />

          {/* Acciones */}
          <div className="mt-5 flex gap-3">
            <POSButton
              title="Cancelar"
              variant="secondary"
              className="flex-1 !bg-transparent"
              onPress={() => setView({kind: 'list'})}
              disabled={submitting}
            />
            <POSButton
              title={isEdit ? 'Guardar cambios' : 'Crear categoría'}
              variant="primary"
              className="flex-1"
              loading={submitting}
              onPress={() => void handleSave()}
              data-testid="cat-save"
            />
          </div>
        </div>
      </div>
    );
  }

  /* ── VISTA LISTA ──────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-[var(--radius-xl)] bg-[var(--color-surface-solid)] p-6 pb-10"
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-[var(--color-border)]" />
        <h2 className="mb-4 text-center text-[var(--font-medium)] font-extrabold text-[var(--color-text)]">
          Categorías
        </h2>

        {/* Botón nueva categoría */}
        <POSButton
          title="Nueva categoría"
          variant="primary"
          className="mb-4 w-full"
          onPress={openCreate}
          data-testid="cat-new"
        />

        {/* Contenido con scroll */}
        <div className="flex-1 space-y-2 overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
              Cargando categorías…
            </p>
          ) : loadError ? (
            <div className="py-6 text-center">
              <p className="mb-3 text-[var(--font-small)] font-semibold text-[var(--color-danger)]">
                {loadError}
              </p>
              <button
                className="rounded-[var(--radius-md)] border border-[var(--color-danger)] px-3 py-1.5 text-[var(--font-small)] font-semibold text-[var(--color-danger)] hover:opacity-70"
                onClick={() => void loadCategories()}
              >
                Reintentar
              </button>
            </div>
          ) : categories.length === 0 ? (
            <p className="py-6 text-center text-[var(--font-regular)] text-[var(--color-text-secondary)]">
              Aún no hay categorías. Crea la primera para organizar tu catálogo.
            </p>
          ) : (
            categories.map(cat => (
              <div
                key={cat.id}
                className="glass-surface flex w-full items-center gap-3 rounded-[var(--radius-lg)] p-3"
                data-testid={`cat-row-${cat.id}`}
              >
                {/* Punto de color + prefijo */}
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[11px] font-black text-white"
                  style={{backgroundColor: cat.color ?? 'var(--color-border)'}}
                >
                  {cat.prefix}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[var(--font-regular)] font-semibold text-[var(--color-text)]">
                    {cat.name}
                  </span>
                  <span className="block text-[var(--font-small)] text-[var(--color-text-secondary)]">
                    {cat.product_count} {cat.product_count === 1 ? 'producto' : 'productos'}
                  </span>
                </span>
                {!cat.is_active && (
                  <span className="shrink-0 rounded-full bg-[var(--color-danger-soft)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--color-danger)]">
                    Inactiva
                  </span>
                )}
                <button
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-primary)]"
                  onClick={() => openEdit(cat)}
                  title="Editar categoría"
                  data-testid={`cat-edit-${cat.id}`}
                >
                  <Pencil size={16} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Botón cerrar */}
        <button
          className="mx-auto mt-4 flex items-center gap-1.5 rounded-[var(--radius-md)] px-4 py-2 text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-primary)]"
          onClick={onClose}
        >
          <X size={16} />
          Cerrar
        </button>
      </div>
    </div>
  );
}
