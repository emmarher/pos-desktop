/**
 * components/ProductFormSheet.tsx — Alta/edición de producto (RF-CA-002).
 *
 * Portado de pos-mobile a React DOM/Tailwind. Sirve para CREAR (POST
 * /products) y EDITAR (PATCH /products/:id). Campos: nombre, categoría,
 * unidad base/venta, precio/costo, stock mínimo, precios por tipo
 * (Público/Mayoreo/Especial con prefill), flags báscula/fraccional e
 * IMAGEN (preview + subir/quitar vía POST|DELETE /products/:id/image;
 * si el upload falla el producto queda guardado — degradación grácil).
 * Requiere permiso products:create (crear) o products:update (editar) —
 * el padre decide si lo muestra.
 */
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ImagePlus, Trash2, X} from 'lucide-react';
import type {Category, MeasurementUnit, PriceType, Product} from '../models';
import {filterAllowedUnits, unitChipLabel} from '../constants/units';
import {
  createProduct,
  deleteProductImage,
  getCategories,
  getMeasurementUnits,
  getPriceTypes,
  IMAGE_MAX_SIZE_BYTES,
  IMAGE_MIME_TYPES,
  updateProduct,
  uploadProductImage,
} from '../api/endpoints';
import {ApiError} from '../api/client';
import {resolveImageUrl} from '../lib/images';
import {toast} from '../hooks/useToast';
import POSButton from './POSButton';

interface ProductFormSheetProps {
  mode: 'create' | 'edit';
  /** Producto a editar (modo edit); prefill de campos/precios. */
  initial?: Product | null;
  onClose: () => void;
  /** Recarga el inventario tras crear/editar (padre). */
  onSaved: () => void;
}

export default function ProductFormSheet({
  mode,
  initial,
  onClose,
  onSaved,
}: ProductFormSheetProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<MeasurementUnit[]>([]);
  const [priceTypes, setPriceTypes] = useState<PriceType[]>([]);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [baseUnitId, setBaseUnitId] = useState<string | null>(null);
  const [saleUnitId, setSaleUnitId] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [stock, setStock] = useState('');
  const [minStock, setMinStock] = useState('');
  const [pricesByType, setPricesByType] = useState<Record<string, string>>({});
  const [isScale, setIsScale] = useState(false);
  const [allowFractional, setAllowFractional] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  /* ── Imagen: archivo nuevo + preview + flag de quitada (solo edición) */
  const [imageFile, setImageFile] = useState<File | null>(null);
  /** Preview visible: object URL del archivo nuevo o URL del backend. */
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  /** true cuando el usuario quitó la imagen existente (modo edit). */
  const [imageRemoved, setImageRemoved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Errores inline por campo (validación visible, no window.alert). */
  const [errors, setErrors] = useState<Record<string, string>>({});

  /* Cargar catálogos al abrir el sheet */
  const loadOptions = useCallback(async () => {
    const [cats, us, pts] = await Promise.all([
      getCategories().catch(() => [] as Category[]),
      getMeasurementUnits().catch(() => [] as MeasurementUnit[]),
      getPriceTypes().catch(() => [] as PriceType[]),
    ]);
    setCategories(cats);
    setUnits(us);
    setPriceTypes(pts);
  }, []);

  /* Prefill al abrir: crear → defaults; editar → desde el producto */
  useEffect(() => {
    void loadOptions();
    if (mode === 'edit' && initial) {
      setName(initial.name);
      setCategoryId(initial.category_id ?? null);
      setBaseUnitId(initial.base_unit_id);
      setSaleUnitId(initial.sale_unit_id);
      setPrice(initial.price ? String(initial.price) : '');
      setCost(initial.cost ? String(initial.cost) : '');
      setStock(initial.stock ? String(initial.stock) : '');
      setMinStock(initial.min_stock ? String(initial.min_stock) : '');
      setIsScale(initial.is_scale_enabled ?? false);
      setAllowFractional(initial.allow_fractional_sale ?? true);
      if (initial.prices && initial.prices.length > 0) {
        const map: Record<string, string> = {};
        for (const p of initial.prices) map[p.price_type_id] = String(p.price);
        setPricesByType(map);
      }
      /* Imagen existente (solo preview; sin archivo local). */
      setImageFile(null);
      setImageRemoved(false);
      setImagePreview(resolveImageUrl(initial.imagen_url));
    } else {
      setName('');
      setCategoryId(null);
      setBaseUnitId(null);
      setSaleUnitId(null);
      setPrice('');
      setCost('');
      setStock('');
      setMinStock('');
      setPricesByType({});
      setIsScale(false);
      setAllowFractional(true);
      setImageFile(null);
      setImageRemoved(false);
      setImagePreview(null);
    }
  }, [mode, initial, loadOptions]);

  /* Limpieza del object URL al desmontar (sin fugas de memoria). */
  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Manejo de imagen ────────────────────────────────────────────── */

  /** Valida y selecciona un archivo de imagen (MIME + tamaño ≤5MB). */
  const handlePickFile = (file: File | undefined | null) => {
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
    setImageFile(file);
    setImageRemoved(false);
    setImagePreview(prev => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  /** Quita la imagen: borra la selección local y marca para DELETE en el backend. */
  const handleRemoveImage = () => {
    setImageFile(null);
    setImageRemoved(true);
    setImagePreview(null);
  };

  /* Prefill de precios por tipo cuando se escribe el precio base */
  const handlePriceChange = (value: string) => {
    setPrice(value);
    const num = parseFloat(value);
    if (!Number.isFinite(num) || num <= 0) return;
    const next: Record<string, string> = {};
    for (const pt of priceTypes) {
      if (pt.code === 'RETAIL') next[pt.id] = value;
      else if (pt.code === 'WHOLESALE') next[pt.id] = (num * 0.9).toFixed(2);
      else if (pt.code === 'SPECIAL') next[pt.id] = (num * 1.15).toFixed(2);
    }
    setPricesByType(prev => ({...next, ...prev}));
  };

  const handleSubmit = async () => {
    // Validación inline: setea errores por campo y notifica sin window.alert.
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'El nombre es obligatorio.';
    if (!baseUnitId || !saleUnitId) e.units = 'Selecciona las unidades base y de venta.';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const num = (s: string) => {
      const v = parseFloat(s);
      return Number.isFinite(v) ? v : undefined;
    };

    const prices = priceTypes
      .filter(pt => {
        const v = parseFloat(pricesByType[pt.id] ?? '');
        return Number.isFinite(v) && v > 0;
      })
      .map(pt => ({
        price_type_id: pt.id,
        price: parseFloat(pricesByType[pt.id]!),
        min_quantity: pt.code === 'WHOLESALE' ? 10 : 1,
      }));

    const payload = {
      name: name.trim(),
      category_id: categoryId,
      base_unit_id: baseUnitId!, // validado arriba: no es null en este punto.
      sale_unit_id: saleUnitId!,
      price: num(price),
      cost: num(cost),
      min_stock: num(minStock),
      is_scale_enabled: isScale,
      allow_fractional_sale: allowFractional,
      prices: prices.length > 0 ? prices : undefined,
    };

    setSubmitting(true);
    try {
      let productId: string;
      if (mode === 'edit' && initial) {
        await updateProduct(initial.id, payload);
        productId = initial.id;
      } else {
        const created = await createProduct(payload);
        productId = created.id;
      }

      /* Imagen DESPUÉS del producto: si falla, el producto queda guardado
       * (degradación grácil) y solo se avisa con toast. */
      try {
        if (imageFile) {
          const bytes = await imageFile.arrayBuffer();
          await uploadProductImage(productId, {
            name: imageFile.name,
            mime: imageFile.type,
            bytes,
          });
        } else if (imageRemoved) {
          await deleteProductImage(productId);
        }
      } catch (imgErr) {
        const msg =
          imgErr instanceof ApiError ? imgErr.message : 'error inesperado';
        toast.error(`Producto guardado, pero no se pudo guardar la imagen (${msg}).`);
      }

      toast.success(
        mode === 'edit'
          ? 'Producto actualizado correctamente.'
          : 'Producto creado correctamente.',
      );
      onSaved();
      onClose();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : `No se pudo ${mode === 'edit' ? 'actualizar' : 'crear'} el producto.`;
      toast.error(`Error al ${mode === 'edit' ? 'actualizar' : 'crear'}: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // PR-1: solo Pieza (piece) y Kilo (kg, 3 decimales = 0.500). El resto queda deshabilitado en BD (PR-2).
  const allowedUnits = useMemo(() => filterAllowedUnits(units), [units]);
  const selectedSaleUnit = units.find(u => u.id === saleUnitId) ?? allowedUnits.find(u => u.id === saleUnitId);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[98vh] w-full max-w-lg flex-col rounded-t-[var(--radius-xl)] bg-[var(--color-surface-solid)] p-6 pb-10"
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-[var(--color-border)]" />
        <h2 className="mb-1 text-center text-[var(--font-medium)] font-extrabold text-[var(--color-text)]">
          {mode === 'edit' ? 'Editar producto' : 'Nuevo producto'}
        </h2>

        {/* Formulario con scroll */}
        <div className="flex-1 overflow-y-auto pb-4">
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
            placeholder="Ej. Arroz 1kg"
            value={name}
            onChange={e => {
              setName(e.target.value);
              if (errors.name) setErrors(existing => ({...existing, name: ''})); // limpiar error al escribir.
            }}
            data-testid="pf-name"
          />
          {errors.name && <p className="mt-1 text-[var(--font-micro)] text-[var(--color-danger)]">{errors.name}</p>}

          {/* Imagen */}
          <label className="mb-1 mt-3 block text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
            Imagen
          </label>
          <div className="flex items-center gap-3">
            {/* Preview 96px: foto actual/nueva o placeholder con inicial */}
            <span className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-primary-soft)]">
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt={name || 'Imagen del producto'}
                  className="h-full w-full object-cover"
                  onError={() => setImagePreview(null)}
                />
              ) : (
                <span className="text-4xl font-black text-[var(--color-primary)]">
                  {(name || '?').charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <div className="flex min-w-0 flex-col gap-2">
              {/* Input de archivo oculto (nativo WebView2, sin plugin dialog) */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={e => {
                  handlePickFile(e.target.files?.[0]);
                  e.currentTarget.value = ''; // permite re-seleccionar el mismo archivo.
                }}
                data-testid="pf-image-input"
              />
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-secondary)]/60 px-3 py-2 text-[var(--font-small)] font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--color-primary-dark)]"
                onClick={() => fileInputRef.current?.click()}
                data-testid="pf-image-pick"
              >
                <ImagePlus size={15} />
                {imagePreview ? 'Cambiar imagen' : 'Agregar imagen'}
              </button>
              {(imagePreview || imageFile || imageRemoved) && (
                <button
                  type="button"
                  className="flex w-fit items-center gap-1.5 px-1 text-[var(--font-small)] font-semibold text-[var(--color-danger)] transition-colors hover:text-[var(--color-primary)]"
                  onClick={handleRemoveImage}
                  data-testid="pf-image-remove"
                >
                  <Trash2 size={14} /> Quitar
                </button>
              )}
              <p className="text-[var(--font-micro)] text-[var(--color-text-secondary)]">
                JPG, PNG o WebP · máx. 5 MB
              </p>
            </div>
          </div>

          {/* Categoría */}
          <label className="mb-1 mt-3 block text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
            Categoría
          </label>
          <div className="flex flex-wrap gap-2">
            {categories.map(c => (
              <button
                key={c.id}
                className={`rounded-[var(--radius-round)] border px-3 py-1.5 text-[var(--font-small)] font-semibold transition-colors ${
                  categoryId === c.id
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]'
                }`}
                onClick={() => setCategoryId(c.id)}
                data-testid={`pf-cat-${c.id}`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Unidades — PR-1: solo Pieza (pz) y Kilo (kg, 0.500) */}
          <label className="mb-1 mt-3 block text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
            Unidad base / venta * <span className="font-normal text-[var(--color-text-secondary)]">(Pieza · Kilo)</span>
          </label>
          <div className={`flex flex-wrap gap-2 ${errors.units ? 'rounded-[var(--radius-md)] border border-[var(--color-danger)] p-2' : ''}`}>
            {allowedUnits.length === 0 ? (
              <p className="w-full py-2 text-center text-[var(--font-small)] text-[var(--color-text-secondary)]">
                Cargando unidades…
              </p>
            ) : (
              allowedUnits.map(u => (
                <button
                  key={u.id}
                  className={`rounded-[var(--radius-round)] border px-3 py-1.5 text-[var(--font-small)] font-semibold transition-colors ${
                    baseUnitId === u.id
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]'
                  }`}
                  onClick={() => {
                    setBaseUnitId(u.id);
                    setSaleUnitId(u.id);
                  }}
                  data-testid={`pf-unit-${u.code}`}
                >
                  {unitChipLabel(u.code, u.name)}
                </button>
              ))
            )}
          </div>
          {errors.units && <p className="mt-1 text-[var(--font-micro)] text-[var(--color-danger)]">{errors.units}</p>}

          {/* Precio / costo */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
                Precio (Público)
              </label>
              <input
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2.5 text-[var(--font-regular)] text-[var(--color-text)] outline-none"
                placeholder="0.00"
                value={price}
                onChange={e => handlePriceChange(e.target.value)}
                data-testid="pf-price"
              />
            </div>
            <div>
              <label className="mb-1 block text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
                Costo
              </label>
              <input
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2.5 text-[var(--font-regular)] text-[var(--color-text)] outline-none"
                placeholder="0.00"
                value={cost}
                onChange={e => setCost(e.target.value)}
                data-testid="pf-cost"
              />
            </div>
          </div>

          {/* Stock tabular */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
                Stock inicial
              </label>
              <input
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2.5 text-[var(--font-regular)] text-[var(--color-text)] outline-none"
                placeholder="0"
                value={stock}
                onChange={e => setStock(e.target.value)}
                data-testid="pf-stock"
              />
            </div>
            <div>
              <label className="mb-1 block text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
                Stock mínimo
              </label>
              <input
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2.5 text-[var(--font-regular)] text-[var(--color-text)] outline-none"
                placeholder="0"
                value={minStock}
                onChange={e => setMinStock(e.target.value)}
                data-testid="pf-minstock"
              />
            </div>
          </div>

          {/* Precios por tipo */}
          {priceTypes.length > 1 && (
            <>
              <label className="mb-1 mt-3 block text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
                Precios por tipo
              </label>
              {priceTypes.map(pt => (
                <div key={pt.id} className="mb-2">
                  <label className="mb-1 block text-[var(--font-micro)] font-medium text-[var(--color-text-secondary)]">
                    {pt.name}
                  </label>
                  <input
                    className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2.5 text-[var(--font-regular)] text-[var(--color-text)] outline-none"
                    placeholder={pt.code === 'WHOLESALE' ? 'x0.9' : pt.code === 'SPECIAL' ? 'x1.15' : '0.00'}
                    value={pricesByType[pt.id] ?? ''}
                    onChange={e => setPricesByType(prev => ({...prev, [pt.id]: e.target.value}))}
                    data-testid={`pf-price-${pt.code}`}
                  />
                </div>
              ))}
            </>
          )}

          {/* Flags */}
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[var(--font-regular)] font-semibold text-[var(--color-text)]">Usa báscula</span>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={isScale}
                disabled={selectedSaleUnit?.unit_type !== 'MASS'}
                onChange={e => setIsScale(e.target.checked)}
              />
              <div className="peer h-6 w-11 rounded-full bg-[var(--color-border)] peer-checked:bg-[var(--color-primary)] peer-disabled:opacity-50" />
              <div className="absolute left-0.5 h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
            </label>
          </div>
          <p className="mt-1 text-[var(--font-micro)] text-[var(--color-text-secondary)]">
            {selectedSaleUnit?.unit_type === 'MASS'
              ? 'La unidad de venta es MASS: se puede habilitar báscula.'
              : 'Báscula solo disponible si la unidad de venta es MASS.'}
          </p>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-[var(--font-regular)] font-semibold text-[var(--color-text)]">Venta fraccional</span>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={allowFractional}
                onChange={e => setAllowFractional(e.target.checked)}
              />
              <div className="peer h-6 w-11 rounded-full bg-[var(--color-border)] peer-checked:bg-[var(--color-primary)]" />
              <div className="absolute left-0.5 h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
            </label>
          </div>
        </div>

        {/* Acciones */}
        <POSButton
          title={submitting ? 'Guardando…' : mode === 'edit' ? 'Guardar cambios' : 'Crear producto'}
          onPress={handleSubmit}
          loading={submitting}
          large
          data-testid="pf-submit"
        />
        <div className="mt-4 flex items-center justify-center">
          <button
            className="flex items-center gap-1 text-[var(--font-small)] text-[var(--color-danger)] hover:text-[var(--color-primary)]"
            onClick={onClose}
          >
            <X size={14} /> Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}