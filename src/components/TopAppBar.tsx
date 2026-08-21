/**
 * components/TopAppBar.tsx — Barra superior (spec 3.1).
 *
 * Portado de pos-mobile a React DOM/Tailwind. Avatar + título + acción de
 * avatar (menú de usuario / cerrar sesión).
 */
import {UserRound} from 'lucide-react';

interface TopAppBarProps {
  title: string;
  avatarLabel?: string;
  onAvatarPress?: () => void;
}

export default function TopAppBar({title, avatarLabel = 'UP', onAvatarPress}: TopAppBarProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 backdrop-blur-[var(--glass-blur)]">
      <div className="flex items-center gap-3">
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-on-primary)] transition-transform hover:scale-105"
          onClick={onAvatarPress}
          data-testid="appbar-avatar"
        >
          <UserRound size={18} strokeWidth={2.2} />
          <span className="sr-only">{avatarLabel}</span>
        </button>
        <h1 className="truncate text-[var(--font-medium)] font-bold text-[var(--color-text)]">
          {title}
        </h1>
      </div>
    </header>
  );
}