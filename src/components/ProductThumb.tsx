/**
 * components/ProductThumb.tsx — Miniatura de producto con imagen del backend.
 *
 * ────────────────────────────────────────────────────────────────────────
 * Qué hace este componente:
 *   - Muestra la foto del producto (`imagen_url`, ruta relativa servida por
 *     el proxy de pos-server) resuelta a URL absoluta con `resolveImageUrl`.
 *   - Si no hay imagen, aún no carga o falla la descarga, muestra el
 *     PLACEHOLDER con la inicial del nombre (degradación grácil, nunca
 *     crash ni layout shift: el tamaño es fijo).
 *   - Memoizado con React.memo y lazy-load (`loading="lazy"` +
 *     `decoding="async"`) para no penalizar listas grandes (AGENTS.md).
 *
 * Props:
 *   - name:       nombre del producto (para la inicial del placeholder).
 *   - imagenUrl:  ruta relativa `/images/{tenant}/{archivo}` o null.
 *   - size:       lado del cuadrado en px (default 44).
 *   - className?: clases extra para el contenedor.
 * ────────────────────────────────────────────────────────────────────────
 */
import {memo, useEffect, useMemo, useState} from 'react';
import {resolveImageUrl} from '../lib/images';

interface ProductThumbProps {
  name: string;
  imagenUrl?: string | null;
  /** Lado del cuadrado en píxeles (default 44). */
  size?: number;
  className?: string;
}

function ProductThumbBase({name, imagenUrl, size = 44, className = ''}: ProductThumbProps) {
  /* URL absoluta resuelta contra el servidor (memoizada por si el store cambia). */
  const url = useMemo(() => resolveImageUrl(imagenUrl), [imagenUrl]);

  /* Si la descarga falla (servidor caído, 404), volvemos al placeholder. */
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);

  const showImage = url !== null && !failed;
  const initial = name.charAt(0).toUpperCase() || '?';

  return (
    <span
      className={`flex shrink-0 select-none items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-primary-soft)] ${className}`}
      style={{width: size, height: size}}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="font-black text-[var(--color-primary)]"
          style={{fontSize: Math.round(size * 0.42)}}
        >
          {initial}
        </span>
      )}
    </span>
  );
}

/** Memoizado: las listas re-renderizan filas idénticas con frecuencia. */
const ProductThumb = memo(ProductThumbBase);
export default ProductThumb;
