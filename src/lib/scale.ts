/**
 * src/lib/scale.ts — Helpers para productos MASS y báscula delegada.
 *
 * ────────────────────────────────────────────────────────────────────────
 * Qué hace este módulo:
 *   - Detecta si un producto es de tipo MASS (peso) y usa báscula.
 *   - Obtiene el device_id de la báscula registrada EN ESTA MÁQUINA
 *     (vía HardwareScreen → device_capabilities del auth store).
 *   - Formatea/parsea peso en kg con precisión de gramos (3 decimales).
 *   - Clampa el peso al stock disponible.
 * ────────────────────────────────────────────────────────────────────────
 */
import type {Product} from '../models';
import {useAuthStore} from '../stores/auth.store';

/** Decimales para kg (gramos). */
export const KG_DECIMALS = 3;
export const KG_STEP = 0.001;
export const KG_MIN = 0.001;

/**
 * True si el producto se vende por peso y tiene báscula habilitada.
 * Requiere: is_scale_enabled=true Y base_unit.unit_type === 'MASS'.
 */
export function isMassProduct(product: Product): boolean {
  return (
    product.is_scale_enabled === true &&
    product.base_unit?.unit_type === 'MASS'
  );
}

/**
 * True si el producto es modo CAJ (caja por peso):
 * base_unit = COUNT (caja) PERO sale_unit = MASS (kg) Y is_scale_enabled.
 */
export function isCajProduct(product: Product): boolean {
  return (
    product.is_scale_enabled === true &&
    product.base_unit?.unit_type === 'COUNT' &&
    product.sale_unit?.unit_type === 'MASS'
  );
}

/**
 * Obtiene el device_id de ESTA MÁQUINA (desde auth store).
 * Si esta máquina tiene báscula registrada en el servidor (can_scale=true),
 * el endpoint /scale/current?device_id=X funcionará.
 * Retorna null si no hay sesión autenticada.
 */
export function getScaleDeviceId(): string | null {
  const deviceId = useAuthStore.getState().deviceId;
  return deviceId ?? null;
}

/**
 * Formatea kg a string con 3 decimales (gramos).
 * Ej: 0.25 → "0.250", 1.5 → "1.500", 1.2345 → "1.235".
 */
export function formatWeightKg(kg: number, decimals = KG_DECIMALS): string {
  if (!Number.isFinite(kg)) return '0.000';
  return kg.toFixed(decimals);
}

/**
 * Parsea string a kg (number). Acepta "0.25", "1,5", ".5", "1.234".
 * Retorna 0 si no es válido.
 */
export function parseWeightKg(str: string): number {
  if (!str) return 0;
  // Reemplazar coma por punto si el usuario usa notación local
  const normalized = str.replace(',', '.');
  const val = parseFloat(normalized);
  return Number.isFinite(val) && val > 0 ? val : 0;
}

/**
 * Limita el peso al rango [KG_MIN, maxKg].
 * maxKg = stock disponible en kg (product.stock).
 */
export function clampWeight(kg: number, maxKg: number): number {
  if (!Number.isFinite(kg)) return KG_MIN;
  if (!Number.isFinite(maxKg) || maxKg <= 0) return KG_MIN;
  return Math.min(Math.max(KG_MIN, kg), maxKg);
}

/**
 * Genera el step para input number según decimales de la unidad.
 * MASS (kg/g) → 3 decimales = 0.001.
 */
export function getWeightStep(decimals = KG_DECIMALS): number {
  return Math.pow(10, -decimals);
}

/**
 * Valida que el peso sea válido para el producto.
 * Retorna {ok: true} | {ok: false, error: string}.
 */
export function validateWeight(
  kg: number,
  product: Product,
): {ok: true} | {ok: false; error: string} {
  if (!Number.isFinite(kg) || kg < KG_MIN) {
    return {ok: false, error: `El peso debe ser mayor a 0 g (mínimo ${formatWeightKg(KG_MIN)})`};
  }
  const maxKg = product.stock;
  if (!Number.isFinite(maxKg) || maxKg <= 0) {
    return {ok: false, error: 'Producto sin stock disponible'};
  }
  if (kg > maxKg) {
    return {
      ok: false,
      error: `Stock insuficiente: disponible ${formatWeightKg(maxKg)} kg`,
    };
  }
  return {ok: true};
}