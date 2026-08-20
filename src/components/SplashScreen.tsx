/**
 * components/SplashScreen.tsx — Pantalla de carga al inicio de la app.
 *
 * Se muestra mientras la app restaura la sesión y conecta con el
 * servidor (boot). Es puramente estática (sin I/O), ligera y sin
 * animaciones costosas para no penalizar WebView2.
 */

import {Store} from 'lucide-react';

export interface SplashScreenProps {
  /** Mensaje de estado del arranque (p. ej. "Conectando al servidor…") */
  message?: string;
}

export default function SplashScreen({message = 'Iniciando sistema POS…'}: SplashScreenProps) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--color-background)]">
      <div className="glass-surface flex flex-col items-center gap-6 px-10 py-12">
        {/* Marca */}
        <div className="flex h-20 w-20 items-center justify-center rounded-[var(--radius-xl)] bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-[0_8px_24px_var(--color-shadow)]">
          <Store size={44} strokeWidth={1.75} />
        </div>

        <div className="text-center">
          <h1 className="text-[var(--font-xlarge)] font-semibold text-[var(--color-text)]">
            Sistema POS
          </h1>
          <p className="mt-1 text-[var(--font-small)] text-[var(--color-text-secondary)]">
            {message}
          </p>
        </div>

        {/* Indicador de carga */}
        <div
          className="h-1.5 w-48 overflow-hidden rounded-full bg-[var(--color-primary-soft)]"
          role="status"
          aria-live="polite"
        >
          <div
            className="h-full rounded-full bg-[var(--color-primary)]"
            style={{
              animation: 'pos-splash-indeterminate 1.2s ease-in-out infinite',
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes pos-splash-indeterminate {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(0%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}