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
import AppRoutes from './navigation/AppRoutes';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [bootMessage] = useState('Iniciando sistema POS…');
  const restoreSession = useAuthStore(state => state.restoreSession);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await restoreSession();
      } catch {
        /* fallo de arranque: se ignora y se va a la pantalla de conexión */
      }
      if (!cancelled) {
        setBooting(false);
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
        </BrowserRouter>
      )}
    </div>
  );
}