/**
 * components/GlassBackground.tsx — Contenedor con estilo glass (portado de pos-mobil).
 *
 * Envuelve el contenido con fondo translúcido, borde brillante y backdrop-filter.
 * Para uso en desktop: el backdrop-filter de WebView2 puede tener un costo
 * de rendimiento leve; mantener `blur` moderado.
 */
import type {HTMLAttributes} from 'react';

export interface GlassBackgroundProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export default function GlassBackground({children, className = '', style, ...rest}: GlassBackgroundProps) {
  return (
    <div
      className={`glass-surface rounded-lg p-6 ${className}`.trim()}
      style={{
        backdropFilter: 'var(--glass-blur)',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border-glass)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}