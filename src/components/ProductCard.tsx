/**
 * components/ProductCard.tsx — Tarjeta de producto del catálogo (spec 3.6).
 *
 * Portado de pos-mobile a React DOM/Tailwind. Muestra thumbnail (foto real
 * del backend o inicial como placeholder), nombre, precio y estado agotado.
 */
import type {Product} from '../models';
import ProductThumb from './ProductThumb';

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
      {/* Thumbnail: foto del producto o inicial */}
      <span className="relative mb-2">
        <ProductThumb name={product.name} imagenUrl={product.imagen_url} size={80} />
        {out && (
          <span className="absolute inset-0 flex items-center justify-center rounded-[var(--radius-md)] bg-black/50 text-xs font-bold text-white">
            Agotado
          </span>
        )}
      </span>
      <span className="w-full truncate text-[var(--font-regular)] font-semibold text-[var(--color-text)]">
        {product.name}
      </span>
      <span className="mt-1 text-[var(--font-medium)] font-extrabold text-[var(--color-primary)]">
        ${product.price.toFixed(2)}
      </span>
    </button>
  );
}