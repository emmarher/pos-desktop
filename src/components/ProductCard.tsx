/**
 * components/ProductCard.tsx — Tarjeta de producto del catálogo (spec 3.6).
 *
 * Portado de pos-mobile a React DOM/Tailwind. Muestra inicial del producto,
 * nombre, precio y estado agotado.
 */
import type {Product} from '../models';

interface ProductCardProps {
  product: Product;
  onPress: () => void;
  testID?: string;
}

export default function ProductCard({product, onPress, testID}: ProductCardProps) {
  const out = product.stock <= 0;

  return (
    <button
      className="glass-surface group flex w-full flex-col items-center rounded-[var(--radius-lg)] p-3 text-left transition-transform hover:scale-[1.02]"
      onClick={onPress}
      data-testid={testID}
    >
      {/* Thumbnail: inicial del producto */}
      <div className="relative mb-2 flex h-20 w-20 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-soft)]">
        <span className="text-3xl font-black text-[var(--color-primary)]">
          {product.name.charAt(0)}
        </span>
        {out && (
          <span className="absolute inset-0 flex items-center justify-center rounded-[var(--radius-md)] bg-black/50 text-xs font-bold text-white">
            Agotado
          </span>
        )}
      </div>
      <span className="w-full truncate text-[var(--font-regular)] font-semibold text-[var(--color-text)]">
        {product.name}
      </span>
      <span className="mt-1 text-[var(--font-medium)] font-extrabold text-[var(--color-primary)]">
        ${product.price.toFixed(2)}
      </span>
    </button>
  );
}