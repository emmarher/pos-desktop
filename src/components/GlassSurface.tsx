/**
 * components/GlassSurface.tsx — Superficie glass (portado de pos-mobil).
 *
 * Una superficie translúcida con borde brillante, útil para tarjetas,
 * encabezados o paneles.
 */
import type {HTMLAttributes} from 'react';

export interface GlassSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export default function GlassSurface({children, className = '', style, ...rest}: GlassSurfaceProps) {
  return (
    <div
      className={`glass-surface rounded-md p-4 ${className}`.trim()}
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