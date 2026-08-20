/**
 * main.tsx — Punto de entrada de la app desktop.
 *
 * 1) Aplica el tema (CSS variables) antes del primer render para evitar
 *    flash de color.
 * 2) Monta App en #root.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/main.css';

// Aplicar tema inicial antes de pintar (sin flash).
const mode = window.matchMedia('(prefers-color-scheme: dark)').matches
  ? 'dark'
  : 'light';
document.documentElement.setAttribute('data-theme', mode);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);