/**
 * screens/DashboardScreen.tsx — Contenedor de pestañas post-login (spec 3.2).
 *
 * Portado de pos-mobile. Pestañas: Productos (terminal), Inventario,
 * Reportes. Reportes solo con reports:read. Cerrar sesión desde el avatar.
 */
import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Settings} from 'lucide-react';
import type {NavTab} from '../components/BottomNavBar';
import PosTerminalScreen from './PosTerminalScreen';
import InventoryScreen from './InventoryScreen';
import ReportsScreen from './ReportsScreen';
import TicketsScreen from './TicketsScreen';
import SettingsScreen from './SettingsScreen';
import {useAuthStore, getStoredTokens} from '../stores/auth.store';
import {getPersistedUsbPrinter, startHardware, stopHardware} from '../services/hardware';
import {getServerOrigin} from '../lib/serverBase';

export default function DashboardScreen() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<NavTab>('caja');
  const logout = useAuthStore(s => s.logout);
  const user = useAuthStore(s => s.user);
  const deviceId = useAuthStore(s => s.deviceId);

  const canViewReports = user?.permissions.includes('reports:read') ?? false;
  const canViewInventory = user?.permissions.includes('inventory:read') ?? false;
  const canViewTickets = user?.permissions.includes('sales:read_own') ?? false;
  const canManageSettings = user?.permissions.includes('settings:manage') ?? false;
  const visibleTabs: NavTab[] = ['caja'];
  if (canViewInventory) visibleTabs.push('inventario');
  if (canViewReports) visibleTabs.push('reportes');
  if (canViewTickets) visibleTabs.push('tickets');
  if (canManageSettings) visibleTabs.push('ajustes');

  /* Arranca el consumidor SSE de impresión si este equipo tiene impresora.
     Sin esto la cola delegada queda sin consumidor. */
  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    void (async () => {
      const [printer, tokens] = await Promise.all([
        getPersistedUsbPrinter(),
        getStoredTokens(),
      ]);
      const origin = getServerOrigin();
      if (cancelled || !origin || !tokens?.access_token || !printer?.printerName) return;
      const url = new URL(origin);
      try {
        await startHardware({
          server_ip: url.hostname,
          server_port: Number(url.port) || 3000,
          device_id: deviceId,
          can_print: true,
          can_scale: false,
          printer_name: printer.printerName,
          access_token: tokens.access_token,
        });
      } catch {
        // Ya estaba corriendo o no hay hardware: la venta directa sigue igual.
      }
    })();
    return () => {
      cancelled = true;
      void stopHardware().catch(() => {});
    };
  }, [deviceId]);

  const effectiveTab: NavTab = visibleTabs.includes(tab) ? tab : 'caja';

  const handleLogout = () => {
    void logout();
    navigate('/', {replace: true});
  };

  // Botón de configuración de hardware (superpone al contenido).
  const hardwareButton = (
    <button
      className="absolute right-4 top-[4.5rem] z-20 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-text-secondary)] shadow-[0_4px_12px_var(--color-shadow)] transition-colors hover:text-[var(--color-primary)]"
      onClick={() => navigate('/hardware')}
      title="Configuración de hardware (impresora/báscula)"
    >
      <Settings size={20} />
    </button>
  );

  if (effectiveTab === 'reportes') {
    return (
      <>
        <ReportsScreen
          activeTab={effectiveTab}
          onTabChange={setTab}
          onLogout={handleLogout}
          visibleTabs={visibleTabs}
        />
        {hardwareButton}
      </>
    );
  }

  if (effectiveTab === 'inventario') {
    return (
      <>
        <InventoryScreen
          activeTab={effectiveTab}
          onTabChange={setTab}
          onLogout={handleLogout}
          visibleTabs={visibleTabs}
        />
        {hardwareButton}
      </>
    );
  }

  if (effectiveTab === 'ajustes') {
    return (
      <SettingsScreen
        activeTab={effectiveTab}
        onTabChange={setTab}
        onLogout={handleLogout}
        visibleTabs={visibleTabs}
      />
    );
  }

  if (effectiveTab === 'tickets') {
    return (
      <>
        <TicketsScreen
          activeTab={effectiveTab}
          onTabChange={setTab}
          onLogout={handleLogout}
          visibleTabs={visibleTabs}
        />
        {hardwareButton}
      </>
    );
  }

  return (
    <>
      <PosTerminalScreen
        activeTab={effectiveTab}
        onTabChange={setTab}
        onLogout={handleLogout}
        visibleTabs={visibleTabs}
      />
      {hardwareButton}
    </>
  );
}