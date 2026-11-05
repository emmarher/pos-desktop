/**
 * App.tsx — Raíz de la app: muestra el splash durante el arranque y luego
 * el navegador según licencia/sesión.
 *
 * Flujo de boot (una sola vez):
 *   1) Mostrar splash (carga visual inmediata, sin lag).
 *   2) restoreSession() → restaurar sesión guardada si existe.
 *   3) Una vez resuelto, renderizar el router de arranque.
 */
import {useEffect, useState} from 'react';
import {BrowserRouter} from 'react-router-dom';
import SplashScreen from './components/SplashScreen';
import {useAuthStore} from './stores/auth.store';
import {hydrateServerStore, readServerFromStorage} from './lib/serverBase';
import {testServer, discoverServer} from './api/discovery';
import AppRoutes from './navigation/AppRoutes';
import ConfirmDialog from './components/ConfirmDialog';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [bootMessage] = useState('Iniciando sistema POS…');
  const restoreSession = useAuthStore(state => state.restoreSession);

  useEffect(() => {
    let cancelled = false;
    let minDelayMet = false;
    const start = Date.now();
    
    (async () => {
      try {
        /* 1) Servidor persistido → store (miniaturas/imágenes lo necesitan
              de forma síncrona; sin esto, tras reiniciar la app con sesión
              guardada todas las fotos caían al placeholder). */
        await hydrateServerStore();
        /* 2) Verificar que la IP guardada responde; si no (p. ej. cambió o el
              server está caído), rediscoveryear antes de restaurar la sesión.
              Sin esto, /auth/refresh pegaba contra la IP muerta vía Rust sin
              timeout, colgaba el arranque y dejaba la app sin servidor. */
        const saved = await readServerFromStorage();
        if (saved) {
          const ok = await testServer(saved); // timeout corto (~4 s) de /health
          if (!ok) await discoverServer();    // reintenta la guardada y si falla, mDNS/UDP/localhost
        } else {
          await discoverServer(); // sin guardada: descubrir antes de restaurar sesión
        }
        /* 3) Sesión guardada (ahora contra una IP viva). */
        await restoreSession();
      } catch {
        /* fallo de arranque: se ignora y se va a la pantalla de conexión */
      }
      
      // Garantizar mínimo 3 segundos de splash
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 3000 - elapsed);
      
      if (!cancelled) {
        setTimeout(() => {
          if (!cancelled && !minDelayMet) {
            minDelayMet = true;
            setBooting(false);
          }
        }, remaining);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [restoreSession]);

  // El router se monta solo cuando termina el boot (una transición limpia).
  return (
    <div className="h-full w-full">
      {booting ? (
        <SplashScreen message={bootMessage} />
      ) : (
        <BrowserRouter>
          <AppRoutes />
          <ConfirmDialog />
        </BrowserRouter>
      )}
    </div>
  );
}