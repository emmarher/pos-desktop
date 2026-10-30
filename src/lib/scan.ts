/**
 * lib/scan.ts — Helper puro de escaneo (escáner HID teclea y manda Enter).
 *
 * findExactCode(): busca el producto cuyo barcode coincide EXACTO o cuyo
 * internal_code coincide EXACTO en MAYÚSCULAS (el backend guarda internal_code
 * en mayúsculas). Solo compara códigos, nunca nombre. Es la parte testeable
 * sin montar UI.
 */
import type {Product} from '../models';

/**
 * Devuelve el producto que matchea el código escaneado, o null si ninguno.
 * - barcode: comparación exacta (case-sensitive, igual que el índice único).
 * - internal_code: exacta en MAYÚSCULAS (el escáner puede mandar minúsculas).
 * Si hubiera varios (barcode repetido en un barcode caído), toma el primero.
 */
export function findExactCode(products: Product[], code: string): Product | null {
  const c = code.trim();
  if (!c) return null;
  // toUpperCase: internal_code se guarda en mayúsculas; barcode se deja tal cual.
  const upper = c.toUpperCase();
  return (
    products.find(p => p.barcode === c) ??
    products.find(p => p.internal_code === upper) ??
    null
  );
}