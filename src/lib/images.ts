/**
 * lib/images.ts — Resolución de URLs de imágenes del backend.
 *
 * ────────────────────────────────────────────────────────────────────────
 * Qué hace este módulo:
 *   - El backend (pos-server) devuelve `imagen_url` como RUTA RELATIVA
 *     (`/images/{tenant_id}/prod_x.webp`) que sirve vía su proxy Fastify.
 *   - `resolveImageUrl(rel)` convierte esa ruta en URL absoluta usando la
 *     IP/puerto del servidor configurado (server store).
 *   - Devuelve null si no hay ruta válida o servidor → el caller muestra
 *     placeholder (degradación grácil, nunca crash).
 * ────────────────────────────────────────────────────────────────────────
 */
import {useServerStore} from '../stores/server.store';

/**
 * Convierte una ruta relativa de imagen en URL absoluta contra el servidor.
 *
 * @param rel Ruta relativa tipo `/images/{tenant}/{archivo}` (o null).
 * @returns URL absoluta `http://{ip}:{puerto}{rel}`, o null si no es válida.
 */
export function resolveImageUrl(rel?: string | null): string | null {
  if (!rel || !rel.startsWith('/')) return null;
  const server = useServerStore.getState().server;
  if (!server?.ip) return null;
  return `http://${server.ip}:${server.port}${rel}`;
}
