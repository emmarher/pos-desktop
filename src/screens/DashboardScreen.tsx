/**
 * screens/DashboardScreen.tsx — Contenedor de pestañas post-login (spec 3.2).
 *
 * Portado de pos-mobile. Pestañas: Productos (terminal), Inventario,
 * Reportes. Reportes solo con reports:read. Cerrar sesión desde el avatar.
 */
import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import BottomNavBar, {NavTab} from '../components/BottomNavBar';
import PosTerminalScreen from './PosTerminalScreen';
import InventoryScreen from './InventoryScreen';
import {useAuthStore} from '../stores/auth.store';

export default function DashboardScreen() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<NavTab>('caja');
  const logout = useAuthStore(s => s.logout);
  const user = useAuthStore(s => s.user);

  const canViewReports = user?.permissions.includes('reports:read') ?? false;
  const visibleTabs: NavTab[] = canViewReports
    ? ['caja', 'inventario', 'reportes']
    : ['caja', 'inventario'];

  const effectiveTab: NavTab = visibleTabs.includes(tab) ? tab : 'caja';

  const handleAvatarPress = () => {
    if (window.confirm('¿Deseas cerrar la sesión actual?')) {
      void logout();
      navigate('/', {replace: true});
    }
  };

  // Reportes aún no está portada; Inventario ya está real.
  if (effectiveTab === 'reportes') {
    return (
      <div className="flex h-full w-full flex-col bg-[var(--color-background)]">
        <div className="flex flex-1 items-center justify-center">
          <div className="glass-surface rounded-lg px-8 py-6">
            <h2 className="text-[var(--font-large)] font-semibold text-[var(--color-text)]">Reportes</h2>
            <p className="mt-1 text-[var(--font-small)] text-[var(--color-text-secondary)]">
              Pantalla en porte — próximamente
            </p>
          </div>
        </div>
        <BottomNavBar active={effectiveTab} onChange={setTab} visibleTabs={visibleTabs} />
      </div>
    );
  }

  if (effectiveTab === 'inventario') {
    return (
      <InventoryScreen
        activeTab={effectiveTab}
        onTabChange={setTab}
        onAvatarPress={handleAvatarPress}
        visibleTabs={visibleTabs}
      />
    );
  }

  return (
    <PosTerminalScreen
      activeTab={effectiveTab}
      onTabChange={setTab}
      onAvatarPress={handleAvatarPress}
      visibleTabs={visibleTabs}
    />
  );
}