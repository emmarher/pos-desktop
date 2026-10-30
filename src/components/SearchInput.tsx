/**
 * components/SearchInput.tsx — Campo de búsqueda (spec 3.5).
 *
 * Portado de pos-mobile a React DOM/Tailwind.
 */
import {Search, X} from 'lucide-react';
import type {Ref} from 'react';

interface SearchInputProps {
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  testID?: string;
  /** El escáner HID teclea el código y manda Enter: se dispara con la tecla Enter. */
  onSubmit?: (text: string) => void;
  /** Ref al <input> para devolverle el foco tras un escaneo. */
  inputRef?: Ref<HTMLInputElement>;
  /** autoFocus: el lector escribe sin necesidad de un clic previo. */
  autoFocus?: boolean;
}

export default function SearchInput({
  placeholder,
  value,
  onChangeText,
  testID,
  onSubmit,
  inputRef,
  autoFocus,
}: SearchInputProps) {
  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-3">
      <Search size={18} className="text-[var(--color-text-secondary)]" />
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        className="w-full bg-transparent text-[var(--font-regular)] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-disabled)]"
        placeholder={placeholder}
        value={value}
        onChange={e => onChangeText(e.target.value)}
        onKeyDown={e => {
          // Enter: el escáner HID lo manda al final del código → comportamiento "scan".
          if (e.key === 'Enter') onSubmit?.(value);
        }}
        data-testid={testID}
      />
      {value.length > 0 && (
        <button
          className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
          onClick={() => onChangeText('')}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}