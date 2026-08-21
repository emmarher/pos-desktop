/**
 * hooks/useTheme.ts — Acceso al tema actual (claro/oscuro).
 *
 * Portado de pos-mobil. El tema POR DEFECTO es LIGHT (la paleta clara es
 * la estándar de la app desktop). Se fija data-theme="light" en <html>
 * para activar las CSS variables de styles/main.css. El dark queda
 * disponible como modo opcional (toggle futuro), no depende del sistema.
 */
import {useEffect, useState} from 'react';
import {posTheme, ThemeMode, POSTheme} from '../constants/theme';

export function useTheme(): POSTheme {
  // Default: light. (El modo oscuro se habilitaría con un toggle.)
  const [mode] = useState<ThemeMode>('light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
  }, [mode]);

  return posTheme[mode];
}