/**
 * components/ProductSheet.tsx — Hoja para agregar producto (RF-VE-002).
 *
 * Portado de pos-mobile a React DOM/Tailwind. Al tocar un producto se abre:
 * nombre, stock, selector de 3 precios (Público/Mayoreo/Especial), cantidad
 * y subtotal. Al confirmar agrega al carrito (Zustand).
 */
import {useEffect, useState} from 'react';
import {Minus, Plus, X} from 'lucide-react';
import type {PriceType, Product} from '../models';
import {getProductPrices} from '../constants/prices';
import {useCartStore} from '../stores/cart.store';
import POSButton from './POSButton';

interface ProductSheetProps {
  product: Product | null;
  onClose: () => void;
  priceTypes?: PriceType[];
}

export default function ProductSheet({product, onClose, priceTypes}: ProductSheetProps) {
  const addItem = useCartStore(state => state.addItem);
  const [quantity, setQuantity] = useState(1);
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(null);

  useEffect(() => {
    setQuantity(1);
    setSelectedPriceId(null);
  }, [product]);

  if (!product) return null;

  const outOfStock = product.stock <= 0;
  const availablePrices = getProductPrices(product, priceTypes);
  const selectedPrice =
    availablePrices.find(p => p.priceType.id === selectedPriceId) ?? availablePrices[0];
  const unitPrice = selectedPrice.price;

  const handleConfirm = () => {
    if (outOfStock) return;
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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-[var(--radius-xl)] bg-[var(--color-surface-solid)] p-6 pb-10"
        onClick={e => e.stopPropagation()}
      >
        {/* Manija */}
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-[var(--color-border)]" />

        <div className="mb-4 text-center">
          <h2 className="text-[var(--font-medium)] font-extrabold text-[var(--color-text)]">
            {product.name}
          </h2>
          <p className="text-[var(--font-small)] text-[var(--color-text-secondary)]">
            {product.sku ?? product.internal_code} · Stock: {product.stock}
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
            {availablePrices.map(({priceType, price}) => {
              const isSelected = priceType.id === selectedPrice.priceType.id;
              return (
                <button
                  key={priceType.id}
                  onClick={() => setSelectedPriceId(priceType.id)}
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

        {/* Selector de cantidad */}
        <div className="mb-5 flex items-center justify-center gap-6">
          <button
            className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] text-[var(--color-danger)] hover:opacity-80"
            onClick={() => setQuantity(q => Math.max(1, q - 1))}
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

        {/* Subtotal */}
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[var(--font-regular)] text-[var(--color-text-secondary)]">Subtotal</span>
          <span className="text-[var(--font-medium)] font-bold text-[var(--color-text)]">
            ${(unitPrice * quantity).toFixed(2)}
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