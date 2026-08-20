/**
 * hooks/useTheme.ts — Acceso al tema actual (claro/oscuro).
 *
 * Portado de pos-mobil. En lugar de useColorScheme (RN), deriva el modo
 * de `prefers-color-scheme` y sincroniza el atributo data-theme de <html>
 * para activar las CSS variables de styles/main.css.
 */
import {useEffect, useState} from 'react';
import {posTheme, ThemeMode, POSTheme} from '../constants/theme';

export function useTheme(): POSTheme {
  const getMode = (): ThemeMode =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';

  const [mode, setMode] = useState<ThemeMode>(getMode);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setMode(getMode());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
  }, [mode]);

  return posTheme[mode];
}