/**
 * constants/units.ts — Unidades permitidas para productos (PR-1 Opción B simplificada).
 *
 * Solo Pieza y Kilo. El Kilo es MASS fraccional (3 decimales) y cubre 0.500.
 * No se usa 'g' separado: 0.500 kg es la forma canónica (evita precio/g).
 * Si luego se requiere gramo, basta añadir 'g' a ALLOWED_UNIT_CODES.
 *
 * Regla de oro: filtrar en UI (1 fuente de verdad) + validación backend futura (PR-2).
 * No crashea: filter tolera array vacío/null.
 */
import type { MeasurementUnit } from '../models';

export const ALLOWED_UNIT_CODES = ['kg', 'piece'] as const;
export type AllowedUnitCode = (typeof ALLOWED_UNIT_CODES)[number];

const ALLOWED_SET = new Set<string>(ALLOWED_UNIT_CODES as readonly string[]);

/** Filtra solo unidades permitidas (pieza/kilo). Tolera `is_active` ausente (pos-desktop no lo tipa). */
export function filterAllowedUnits(units: MeasurementUnit[] | null | undefined): MeasurementUnit[] {
  if (!Array.isArray(units) || units.length === 0) return [];
  return units.filter(u => u && ALLOWED_SET.has(u.code) && (u as unknown as { is_active?: boolean }).is_active !== false);
}

/** Label corto para chip. */
export function unitChipLabel(code: string, fallbackName: string): string {
  if (code === 'kg') return 'Kilo (kg)';
  if (code === 'piece') return 'Pieza (pz)';
  return fallbackName;
}
