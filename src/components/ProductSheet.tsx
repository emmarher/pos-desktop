/**
 * components/ProductSheet.tsx — Hoja para agregar producto (RF-VE-002).
 *
 * Portado de pos-mobile a React DOM/Tailwind. Al tocar un producto se abre:
 * foto (o placeholder con inicial), nombre, stock, selector de 3 precios
 * (Público/Mayoreo/Especial), cantidad/peso y subtotal. Al confirmar agrega al
 * carrito (Zustand).
 * Soporta:
 *   - COUNT: cantidad entera (+/-)
 *   - MASS: peso en kg (input decimal 3 decimales, step 0.001)
 *   - CAJ: 1 caja + peso en kg (báscula o manual)
 */
import {useEffect, useRef, useState} from 'react';
import {Minus, Plus, X, RefreshCw, Scale} from 'lucide-react';
import type {PriceType, Product} from '../models';
import {getProductPrices, type ProductPriceOption} from '../constants/prices';
import {resolveImageUrl} from '../lib/images';
import {
  isMassProduct,
  isCajProduct,
  formatWeightKg,
  parseWeightKg,
  clampWeight,
  validateWeight,
  getScaleDeviceId,
  KG_MIN,
} from '../lib/scale';
import {useCartStore} from '../stores/cart.store';
import {toast} from '../hooks/useToast';
import POSButton from './POSButton';
import {getScaleReading} from '../api/endpoints';

interface ProductSheetProps {
  product: Product | null;
  onClose: () => void;
  priceTypes?: PriceType[];
  /** device_id de la báscula si esta máquina la tiene registrada (desde HardwareScreen). */
  scaleDeviceId?: string;
}

export default function ProductSheet({
  product,
  onClose,
  priceTypes,
  scaleDeviceId: propScaleDeviceId,
}: ProductSheetProps) {
  const addItem = useCartStore(state => state.addItem);
  const [quantity, setQuantity] = useState(1);
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(null);
  /** La foto falló al cargar → placeholder con inicial (degradación grácil). */
  const [imageFailed, setImageFailed] = useState(false);

  /* ── Estado para productos MASS/CAJ ────────────────────────────────── */
  const [weightKgStr, setWeightKgStr] = useState<string>(formatWeightKg(KG_MIN));
  const [weightKg, setWeightKg] = useState<number>(KG_MIN);
  const [isReadingScale, setIsReadingScale] = useState(false);
  const [scaleError, setScaleError] = useState<string | null>(null);
  const weightInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuantity(1);
    setSelectedPriceId(null);
    setImageFailed(false);
    /* Reset peso al cambiar de producto */
    setWeightKgStr(formatWeightKg(KG_MIN));
    setWeightKg(KG_MIN);
    setScaleError(null);
  }, [product]);

  /* Seleccionar todo el texto del input al cambiar de producto (mount/swap) */
  useEffect(() => {
    if (weightInputRef.current) {
      weightInputRef.current.focus();
      requestAnimationFrame(() => weightInputRef.current?.select());
    }
  }, [product?.id]);

  if (!product) return null;

  /* Detectar tipo de producto (ya sabemos que product no es null) */
  const isMass = isMassProduct(product);
  const isCaj = isCajProduct(product);
  const hasScale = !!(propScaleDeviceId ?? getScaleDeviceId());
  const effectiveScaleDeviceId = propScaleDeviceId ?? getScaleDeviceId();

  const outOfStock = product.stock <= 0;
  const imageUrl = resolveImageUrl(product.imagen_url);
  const availablePrices = getProductPrices(product, priceTypes);
  const selectedPrice =
    availablePrices.find(p => p.priceType.id === selectedPriceId) ?? availablePrices[0];
  const unitPrice = selectedPrice.price;

  /* Stock máximo en kg para MASS (product.stock ya está en base_unit = kg) */
  const maxWeightKg = product.stock;

  /** Leer peso desde la báscula delegada */
  const handleReadScale = async () => {
    if (!effectiveScaleDeviceId) return;
    setIsReadingScale(true);
    setScaleError(null);
    try {
      const reading = await getScaleReading(effectiveScaleDeviceId);
      if (reading?.current_scale_weight != null && reading.current_scale_weight > 0) {
        const clamped = clampWeight(reading.current_scale_weight, maxWeightKg);
        setWeightKg(clamped);
        setWeightKgStr(formatWeightKg(clamped));
      } else {
        setScaleError('Báscula no devolvió peso válido');
        toast.error('Báscula no devolvió peso válido, use entrada manual');
      }
    } catch (e) {
      setScaleError('Báscula no responde');
      toast.error('Báscula no responde, use entrada manual');
    } finally {
      setIsReadingScale(false);
    }
  };

  /** Validar y confirmar agregar al carrito */
  const handleConfirm = () => {
    if (outOfStock) return;

    if (isMass) {
      const validation = validateWeight(weightKg, product);
      if (!validation.ok) {
        toast.error(validation.error);
        return;
      }
      const qty = weightKg; // cantidad = peso en kg
      addItem({
        key: `${product.id}-${Date.now().toString(36)}`,
        product,
        quantity: qty,
        weightKg: qty,
        priceType: selectedPrice.priceType,
        unitPrice,
        discount: 0,
        subtotal: unitPrice * qty,
        baseQuantity: qty * product.unit_conversion,
        isCaj: false,
      });
      onClose();
      return;
    }

    if (isCaj) {
      const validation = validateWeight(weightKg, product);
      if (!validation.ok) {
        toast.error(validation.error);
        return;
      }
      addItem({
        key: `${product.id}-${Date.now().toString(36)}`,
        product,
        quantity: 1, // 1 caja
        weightKg,
        priceType: selectedPrice.priceType,
        unitPrice,
        discount: 0,
        subtotal: unitPrice * weightKg,
        baseQuantity: weightKg * product.unit_conversion,
        isCaj: true,
      });
      onClose();
      return;
    }

    /* COUNT normal */
    addItem({
      key: `${product.id}-${Date.now().toString(36)}`,
      product,
      quantity,
      priceType: selectedPrice.priceType,
      unitPrice,
      discount: 0,
      subtotal: unitPrice * quantity,
      baseQuantity: quantity * product.unit_conversion,
      isCaj: false,
    });
    onClose();
  };

  /**
   * Selección de tipo de precio alineada con el servidor: si el precio
   * requiere una cantidad mínima (ej. Mayoreo desde 12), la cantidad se
   * ajusta automáticamente; si no hay stock suficiente para el mínimo, no
   * se permite seleccionarlo. Sin esto, el backend aplicaría el fallback
   * al precio base y los pagos no cubrirían el total.
   */
  const handleSelectPrice = (option: ProductPriceOption) => {
    if (quantity < option.minQuantity) {
      if (product.stock >= option.minQuantity) {
        setQuantity(option.minQuantity);
        toast.info(
          `${option.priceType.name} aplica desde ${option.minQuantity} pzas.`,
        );
      } else {
        toast.error(
          `${option.priceType.name} requiere ${option.minQuantity} pzas y solo hay ${product.stock}.`,
        );
        return;
      }
    }
    setSelectedPriceId(option.priceType.id);
  };

  /**
   * Al bajar de la cantidad mínima del tipo seleccionado, el servidor ya no
   * aplicaría ese precio (fallback a base) → revertimos a Público para que
   * lo cobrado coincida siempre con lo mostrado.
   */
  const handleDecrement = () => {
    setQuantity(q => {
      const next = Math.max(1, q - 1);
      if (next < selectedPrice.minQuantity && selectedPrice.minQuantity > 1) {
        setSelectedPriceId(availablePrices[0].priceType.id);
        toast.info(`Cantidad menor a ${selectedPrice.minQuantity}: precio Público.`);
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-[var(--radius-xl)] bg-[var(--color-surface-solid)] p-6 pb-10"
        onClick={e => e.stopPropagation()}
      >
        {/* Manija */}
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-[var(--color-border)]" />

        {/* Foto grande del producto (o placeholder con inicial) */}
        <div className="mx-auto mb-4 flex h-32 w-32 items-center justify-center overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-primary-soft)]">
          {imageUrl && !imageFailed ? (
            <img
              src={imageUrl}
              alt={product.name}
              loading="lazy"
              decoding="async"
              draggable={false}
              className="h-full w-full object-cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className="text-6xl font-black text-[var(--color-primary)]">
              {product.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div className="mb-4 text-center">
          <h2 className="text-[var(--font-medium)] font-extrabold text-[var(--color-text)]">
            {product.name}
          </h2>
          <p className="text-[var(--font-small)] text-[var(--color-text-secondary)]">
            {product.sku ?? product.internal_code} · Stock:{' '}
            {isMass || isCaj
              ? formatWeightKg(product.stock) + ' kg'
              : String(product.stock)}
          </p>
        </div>

        {outOfStock && (
          <div className="mx-auto mb-3 w-fit rounded-[var(--radius-round)] bg-[var(--color-danger-soft)] px-3 py-1 text-[var(--font-small)] font-bold text-[var(--color-danger)]">
            Producto agotado
          </div>
        )}

        {/* Precio + selector de tipo */}
        <div className="mb-4 text-center">
          <span className="text-[var(--font-xlarge)] font-extrabold text-[var(--color-primary)]">
            ${unitPrice.toFixed(2)}
          </span>
          <span className="ml-2 text-[var(--font-small)] text-[var(--color-text-secondary)]">
            / {selectedPrice.priceType.name}
          </span>
        </div>

        {/* Chips de precios por tipo */}
        {availablePrices.length > 1 && (
          <div className="mb-4 flex flex-wrap justify-center gap-2">
            {availablePrices.map(({priceType, price, minQuantity}) => {
              const isSelected = priceType.id === selectedPrice.priceType.id;
              return (
                <button
                  key={priceType.id}
                  onClick={() => handleSelectPrice({priceType, price, minQuantity})}
                  className={`flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 transition-colors ${
                    isSelected
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]'
                  }`}
                  data-testid={`price-${priceType.code}`}
                >
                  <span className="text-[var(--font-small)] font-semibold">{priceType.name}</span>
                  <span className="text-[var(--font-regular)] font-extrabold">${price.toFixed(2)}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Selector de cantidad / peso */}
        {isMass ? (
          /* ── MODO MASS: input de peso en kg ──────────────────────────── */
          <div className="mb-5 space-y-3">
            <label className="block text-left text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
              Peso (kg)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="text"
                ref={weightInputRef}
                defaultValue={weightKgStr}
                value={weightKgStr}
                onChange={e => {
                  const raw = e.target.value;
                  // Solo dígitos y máximo UN punto decimal
                  const filtered = raw.replace(/[^0-9.]/g, '').replace(/^(\d*\.?\d*).*$/, '$1');
                  // Evitar múltiples puntos
                  const parts = filtered.split('.');
                  const clean = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : filtered;

                  setWeightKgStr(clean);
                  const val = parseWeightKg(clean);
                  setWeightKg(clampWeight(val, maxWeightKg));
                }}
                onBlur={e => {
                  const val = parseWeightKg(e.target.value);
                  const clamped = clampWeight(val, maxWeightKg);
                  setWeightKg(clamped);
                  setWeightKgStr(formatWeightKg(clamped));
                }}
                onFocus={() => {
                  // requestAnimationFrame asegura selección tras paint del navegador
                  requestAnimationFrame(() => weightInputRef.current?.select());
                }}
                className="flex-1 w-32 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2.5 text-[var(--font-regular)] text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
                data-testid="mass-weight-input"
                inputMode="decimal"
                pattern="[0-9.]*"
              />
              <span className="text-[var(--font-small)] text-[var(--color-text-secondary)]">
                kg (mín {formatWeightKg(KG_MIN)}, máx {formatWeightKg(maxWeightKg)})
              </span>
            </div>
            {hasScale && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isReadingScale}
                  onClick={handleReadScale}
                  className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--font-small)] font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-primary-soft)] disabled:opacity-50"
                  data-testid="btn-read-scale"
                >
                  {isReadingScale ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" /> Leyendo…
                    </>
                  ) : (
                    <>
                      <Scale size={16} /> Leer báscula
                    </>
                  )}
                </button>
                {scaleError && (
                  <span className="text-[var(--font-micro)] text-[var(--color-danger)]">
                    ⚠ {scaleError}
                  </span>
                )}
              </div>
            )}
            <p className="text-[var(--font-micro)] text-[var(--color-text-secondary)]">
              {hasScale
                ? 'Peso leído de la báscula. Puede editarlo manualmente (override).'
                : 'Sin báscula configurada en esta máquina. Ingrese el peso manualmente.'}
            </p>
          </div>
        ) : isCaj ? (
          /* ── MODO CAJ: 1 caja + peso en kg ───────────────────────────── */
          <div className="mb-5 space-y-3">
            <div className="flex items-center justify-center gap-4">
              <span className="text-[var(--font-small)] text-[var(--color-text-secondary)]">
                Cantidad:
              </span>
              <span className="min-w-12 text-center text-[var(--font-xlarge)] font-extrabold text-[var(--color-text)]">
                1
              </span>
              <span className="text-[var(--font-small)] text-[var(--color-text-secondary)]">
                caja
              </span>
            </div>
            <label className="block text-left text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
              Peso de la caja (kg)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="text"
                ref={weightInputRef}
                defaultValue={weightKgStr}
                value={weightKgStr}
                onChange={e => {
                  const raw = e.target.value;
                  // Solo dígitos y máximo UN punto decimal
                  const filtered = raw.replace(/[^0-9.]/g, '').replace(/^(\d*\.?\d*).*$/, '$1');
                  // Evitar múltiples puntos
                  const parts = filtered.split('.');
                  const clean = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : filtered;

                  setWeightKgStr(clean);
                  const val = parseWeightKg(clean);
                  setWeightKg(clampWeight(val, maxWeightKg));
                }}
                onBlur={e => {
                  const val = parseWeightKg(e.target.value);
                  const clamped = clampWeight(val, maxWeightKg);
                  setWeightKg(clamped);
                  setWeightKgStr(formatWeightKg(clamped));
                }}
                onFocus={() => {
                  requestAnimationFrame(() => weightInputRef.current?.select());
                }}
                className="flex-1 w-32 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2.5 text-[var(--font-regular)] text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
                data-testid="caj-weight-input"
                inputMode="decimal"
                pattern="[0-9.]*"
              />
              <span className="text-[var(--font-small)] text-[var(--color-text-secondary)]">
                kg
              </span>
            </div>
            {hasScale && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isReadingScale}
                  onClick={handleReadScale}
                  className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--font-small)] font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-primary-soft)] disabled:opacity-50"
                  data-testid="btn-read-scale"
                >
                  {isReadingScale ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" /> Leyendo…
                    </>
                  ) : (
                    <>
                      <Scale size={16} /> Leer báscula
                    </>
                  )}
                </button>
                {scaleError && (
                  <span className="text-[var(--font-micro)] text-[var(--color-danger)]">
                    ⚠ {scaleError}
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          /* ── MODO COUNT: selector +/- original ───────────────────────── */
          <div className="mb-5 flex items-center justify-center gap-6">
            <button
              className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] text-[var(--color-danger)] hover:opacity-80"
              onClick={handleDecrement}
              data-testid="qty-minus"
            >
              <Minus size={22} />
            </button>
            <span className="min-w-12 text-center text-[var(--font-xlarge)] font-extrabold text-[var(--color-text)]">
              {quantity}
            </span>
            <button
              className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-soft)] text-[var(--color-primary)] hover:opacity-80"
              onClick={() => setQuantity(q => Math.min(product.stock, q + 1))}
              data-testid="qty-plus"
            >
              <Plus size={22} />
            </button>
          </div>
        )}

        {/* Subtotal */}
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[var(--font-regular)] text-[var(--color-text-secondary)]">Subtotal</span>
          <span className="text-[var(--font-medium)] font-bold text-[var(--color-text)]">
            {isMass
              ? '$' + (unitPrice * weightKg).toFixed(2)
              : isCaj
              ? '$' + (unitPrice * weightKg).toFixed(2)
              : '$' + (unitPrice * quantity).toFixed(2)}
          </span>
        </div>

        <POSButton
          title={outOfStock ? 'Agotado' : 'Agregar al carrito'}
          onPress={handleConfirm}
          disabled={outOfStock}
          large
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