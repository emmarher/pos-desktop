/**
 * components/Fab.tsx — Botón flotante (spec 3.7).
 *
 * Portado de pos-mobile a React DOM/Tailwind. Variante 'cart' con badge y
 * 'add' con icono +.
 */
import {ShoppingCart, Plus} from 'lucide-react';

interface FabProps {
  onPress: () => void;
  variant?: 'cart' | 'add';
  badgeCount?: number;
  testID?: string;
}

export default function Fab({onPress, variant = 'cart', badgeCount = 0, testID}: FabProps) {
  const Icon = variant === 'cart' ? ShoppingCart : Plus;
  return (
    <button
      className="absolute bottom-20 right-5 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-[0_8px_24px_var(--color-shadow)] transition-transform hover:scale-105"
      onClick={onPress}
      data-testid={testID}
    >
      <Icon size={26} strokeWidth={2} />
      {variant === 'cart' && badgeCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-[var(--color-warning)] px-1 text-xs font-bold text-white">
          {badgeCount}
        </span>
      )}
    </button>
  );
}