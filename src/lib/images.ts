/**
 * lib/images.ts — Resolución de URLs de imágenes del backend.
 *
 * ────────────────────────────────────────────────────────────────────────
 * Qué hace este módulo:
 *   - El backend (pos-server) devuelve `imagen_url` como RUTA RELATIVA
 *     (`/images/{tenant_id}/prod_x.webp`) que sirve vía su proxy Fastify.
 *   - `resolveImageUrl(rel, origin)` convierte esa ruta en URL absoluta
 *     contra el servidor POS (`lib/serverBase.ts`).
 *   - `useResolvedImageUrl(rel)` es la variante REACTIVA: si el servidor
 *     todavía no se conoce (arranque en frío), devuelve null y vuelve a
 *     resolver en cuanto el store se hidrata — esto es lo que faltaba y
 *     hacía que las miniaturas se quedaran en el placeholder tras
 *     reiniciar la app con la sesión guardada.
 *   - Devuelve null si no hay ruta válida o servidor → el caller muestra
 *     placeholder (degradación grácil, nunca crash).
 * ────────────────────────────────────────────────────────────────────────
 */
import {useMemo} from 'react';
import {getServerOrigin, useServerOrigin} from './serverBase';

/**
 * Convierte una ruta relativa de imagen en URL absoluta contra el servidor.
 *
 * @param rel Ruta relativa tipo `/images/{tenant}/{archivo}` (o null).
 * @param origin Origen opcional (`http://ip:puerto`). Si se omite se usa el
 *   servidor actual del store; los componentes deben pasar el valor del
 *   hook `useServerOrigin()` para que la URL sea reactiva.
 * @returns URL absoluta `http://{ip}:{puerto}{rel}`, o null si no es válida.
 */
export function resolveImageUrl(
  rel?: string | null,
  origin?: string | null,
): string | null {
  if (!rel || !rel.startsWith('/')) return null;
  const base = origin === undefined ? getServerOrigin() : origin;
  if (!base) return null;
  return `${base}${rel}`;
}

/**
 * Hook: URL absoluta de una imagen del backend, recalculada cuando cambia
 * el producto o el servidor configurado. Null = mostrar placeholder.
 */
export function useResolvedImageUrl(rel?: string | null): string | null {
  const origin = useServerOrigin();
  return useMemo(() => resolveImageUrl(rel, origin), [rel, origin]);
}
