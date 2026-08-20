/**
 * layout/Breakpoints.ts — Breakpoints de la ventana de escritorio.
 *
 * Portado verbatim desde pos-mobil.
 */
export type Breakpoint = 'narrow' | 'medium' | 'wide';

export const BREAKPOINT_NARROW = 900;
export const BREAKPOINT_WIDE = 1280;

export const RAIL_WIDTH = 72;
export const CART_PANEL_WIDTH = 340;

export function getBreakpoint(width: number): Breakpoint {
  if (width < BREAKPOINT_NARROW) {
    return 'narrow';
  }
  if (width < BREAKPOINT_WIDE) {
    return 'medium';
  }
  return 'wide';
}

export function getGridColumns(breakpoint: Breakpoint): number {
  switch (breakpoint) {
    case 'wide':
      return 6;
    case 'medium':
      return 4;
    case 'narrow':
      return 2;
  }
}