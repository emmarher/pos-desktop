/**
 * layout/useWindowBreakpoint.ts — Breakpoint reactivo al ancho de la ventana.
 *
 * Portado de pos-mobil. Escucha resize de window en lugar de
 * useWindowDimensions.
 */
import {useEffect, useState} from 'react';
import {Breakpoint, getBreakpoint} from './Breakpoints';

export function useWindowBreakpoint(): Breakpoint {
  const getWidth = () => window.innerWidth;
  const [width, setWidth] = useState<number>(getWidth);

  useEffect(() => {
    const onChange = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onChange);
    return () => window.removeEventListener('resize', onChange);
  }, []);

  return getBreakpoint(width);
}