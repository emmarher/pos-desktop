/**
 * screens/DashboardScreen.tsx — Contenedor de pestañas post-login (spec 3.2).
 *
 * Portado de pos-mobile. Pestañas: Productos (terminal), Inventario,
 * Reportes. Reportes solo con reports:read. Cerrar sesión desde el avatar.
 */
import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Settings} from 'lucide-react';
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
          onAvatarPress={handleAvatarPress}
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
          onAvatarPress={handleAvatarPress}
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
        onAvatarPress={handleAvatarPress}
        visibleTabs={visibleTabs}
      />
      {hardwareButton}
    </>
  );
}