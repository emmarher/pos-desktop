/**
 * App.tsx — Raíz de la app: muestra el splash durante el arranque y luego
 * el navegador según licencia.
 *
 * Flujo de boot (una sola vez):
 *   1) Mostrar splash (carga visual inmediata, sin lag).
 *   2) Borrar credenciales persistidas por versiones anteriores.
 *   3) Hidratar/buscar servidor (la IP sí se conserva).
 *   4) Renderizar el router: SIEMPRE empieza en Login; no se restaura sesión.
 */
import {useEffect, useState} from 'react';
import {BrowserRouter} from 'react-router-dom';
import SplashScreen from './components/SplashScreen';
import {clearPersistedSession} from './stores/auth.store';
import {hydrateServerStore, readServerFromStorage} from './lib/serverBase';
import {testServer, discoverServer} from './api/discovery';
import AppRoutes from './navigation/AppRoutes';
import ConfirmDialog from './components/ConfirmDialog';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [bootMessage] = useState('Iniciando sistema POS…');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      /* Sin sesión persistente: cada arranque pide login. Se borran los
         tokens que versiones anteriores guardaban en localStorage. */
      await clearPersistedSession();

      try {
        /* 1) Servidor persistido → store (miniaturas/imágenes lo necesitan
              de forma síncrona; sin esto, las fotos caían al placeholder). */
        await hydrateServerStore();
        /* 2) Verificar que la IP guardada responde; si no (p. ej. cambió o el
              server está caído), rediscoveryear antes de mostrar el login. */
        const saved = await readServerFromStorage();
        if (saved) {
          const ok = await testServer(saved); // timeout corto (~4 s) de /health
          if (!ok) await discoverServer();    // reintenta la guardada y si falla, mDNS/UDP/localhost
        } else {
          await discoverServer(); // sin guardada: descubrir antes del login
        }
      } catch {
        /* fallo de arranque: se ignora y se va a la pantalla de conexión */
      }

      if (!cancelled) setBooting(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
