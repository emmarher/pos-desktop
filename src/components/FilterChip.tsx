/**
 * components/FilterChip.tsx — Chip de filtro/categoría (spec 3.4).
 *
 * Portado de pos-mobile a React DOM/Tailwind.
 */
interface FilterChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}

export default function FilterChip({label, active, onPress, testID}: FilterChipProps) {
  return (
    <button
      className={`h-8 rounded-[var(--radius-round)] border px-4 text-[var(--font-small)] font-semibold transition-colors ${
        active
          ? 'border-[var(--color-primary)] bg-[var(--color-secondary)]/50 text-[var(--color-on-primary)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-soft)]'
      }`}
      onClick={onPress}
      data-testid={testID}
    >
      {label}
    </button>
  );
}