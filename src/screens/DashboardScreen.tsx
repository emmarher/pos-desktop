/**
 * screens/DashboardScreen.tsx — Contenedor de pestañas post-login (spec 3.2).
 *
 * Portado de pos-mobile. Pestañas: Productos (terminal), Inventario,
 * Reportes. Reportes solo con reports:read. Cerrar sesión desde el avatar.
 */
import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import type {NavTab} from '../components/BottomNavBar';
import PosTerminalScreen from './PosTerminalScreen';
import InventoryScreen from './InventoryScreen';
import ReportsScreen from './ReportsScreen';
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

  if (effectiveTab === 'reportes') {
    return (
      <ReportsScreen
        activeTab={effectiveTab}
        onTabChange={setTab}
        onAvatarPress={handleAvatarPress}
        visibleTabs={visibleTabs}
      />
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