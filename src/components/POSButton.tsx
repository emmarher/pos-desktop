/**
 * components/POSButton.tsx — Botón de la UI vet glass (portado de pos-mobil).
 *
 * Utiliza las variables CSS del tema glass (definidas en styles/main.css).
 * Variantes: primary, secondary, ghost, large.
 */
import type {ButtonHTMLAttributes} from 'react';

export interface POSButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  large?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  'data-testid'?: string;
}

export default function POSButton({
  title,
  onPress,
  loading,
  large = false,
  variant = 'primary',
  className = '',
  'data-testid': testID,
  disabled,
  ...rest
}: POSButtonProps) {
  const commonClass =
    'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-outline-none focus:ring-2 focus:ring-inset';

  const primaryClass = 'focus:ring-primary-500';

  const secondaryClass = 'focus:ring-secondary-500';

  const ghostClass = 'border border-primary/20 text-primary';

  const baseClasses = `${commonClass} focus-outline-none`;

  const largeClasses = large ? 'px-6 py-3 text-lg' : 'px-4 py-2 text-sm';

  const variantClasses = variant === 'primary'
    ? primaryClass
    : variant === 'secondary'
      ? secondaryClass
      : variant === 'ghost'
        ? ghostClass
        : '';

  const fullClass = `${baseClasses} ${variantClasses} ${largeClasses} ${className}`.trim();

  const isDisabled = disabled ?? loading;

  return (
    <button
      className={fullClass}
      onClick={onPress}
      disabled={isDisabled}
      data-testid={testID}
      aria-disabled={isDisabled}
      {...rest}
    >
      {loading ? (
        <span>
          <svg
            className="animate-spin h-4 w-4 mr-2 opacity-60"
            viewBox="0 0 24 24"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              fill="none"
            />
            <path
              cx="12"
              cy="12"
              r="3"
              stroke="currentColor"
              strokeWidth="3"
              fill="none"
            />
          </svg>
        </span>
      ) : (
        title
      )}
    </button>
  );
}