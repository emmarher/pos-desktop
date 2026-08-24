/**
 * components/ProductFormSheet.tsx — Alta/edición de producto (RF-CA-002).
 *
 * Portado de pos-mobile a React DOM/Tailwind. Sirve para CREAR (POST
 * /products) y EDITAR (PATCH /products/:id). Campos: nombre, categoría,
 * unidad base/venta, precio/costo, stock mínimo, precios por tipo
 * (Público/Mayoreo/Especial con prefill) y flags báscula/fraccional.
 * Requiere permiso products:create (crear) o products:update (editar) —
 * el padre decide si lo muestra.
 */
import {useCallback, useEffect, useState} from 'react';
import {X} from 'lucide-react';
import type {Category, MeasurementUnit, PriceType, Product} from '../models';
import {
  createProduct,
  getCategories,
  getMeasurementUnits,
  getPriceTypes,
  updateProduct,
} from '../api/endpoints';
import {ApiError} from '../api/client';
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
    }
  }, [mode, initial, loadOptions]);

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
    if (!name.trim()) {
      window.alert('El nombre es obligatorio.');
      return;
    }
    if (!baseUnitId || !saleUnitId) {
      window.alert('Selecciona las unidades base y de venta.');
      return;
    }
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
      base_unit_id: baseUnitId,
      sale_unit_id: saleUnitId,
      price: num(price),
      cost: num(cost),
      min_stock: num(minStock),
      is_scale_enabled: isScale,
      allow_fractional_sale: allowFractional,
      prices: prices.length > 0 ? prices : undefined,
    };

    setSubmitting(true);
    try {
      if (mode === 'edit' && initial) {
        await updateProduct(initial.id, payload);
        window.alert('Producto actualizado correctamente.');
      } else {
        await createProduct(payload);
        window.alert('Producto creado correctamente.');
      }
      onSaved();
      onClose();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : `No se pudo ${mode === 'edit' ? 'actualizar' : 'crear'} el producto.`;
      window.alert(`Error al ${mode === 'edit' ? 'actualizar' : 'crear'}: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedSaleUnit = units.find(u => u.id === saleUnitId);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-[var(--radius-xl)] bg-[var(--color-surface-solid)] p-6 pb-10"
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
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2.5 text-[var(--font-regular)] text-[var(--color-text)] outline-none"
            placeholder="Ej. Arroz 1kg"
            value={name}
            onChange={e => setName(e.target.value)}
            data-testid="pf-name"
          />

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

          {/* Unidades */}
          <label className="mb-1 mt-3 block text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
            Unidad base / venta *
          </label>
          <div className="flex flex-wrap gap-2">
            {units.map(u => (
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
                {u.name}
              </button>
            ))}
          </div>

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
            className="flex items-center gap-1 text-[var(--font-small)] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
            onClick={onClose}
          >
            <X size={14} /> Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}