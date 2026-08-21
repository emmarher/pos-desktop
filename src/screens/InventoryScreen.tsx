/**
 * screens/InventoryScreen.tsx — Gestión de inventario (spec 4.3).
 *
 * Portado de pos-mobile a React DOM/Tailwind. Datos reales del backend:
 * lista de productos, KPIs (total/agotados/categorías), filtro por
 * categoría, ajustar stock (Admin) y crear producto (Admin).
 */
import {useCallback, useEffect, useMemo, useState} from 'react';
import type {Category, Product} from '../models';
import {searchProducts, getCategories} from '../api/endpoints';
import {useAuthStore} from '../stores/auth.store';
import BottomNavBar, {NavTab} from '../components/BottomNavBar';
import TopAppBar from '../components/TopAppBar';
import SearchInput from '../components/SearchInput';
import FilterChip from '../components/FilterChip';
import KpiCard from '../components/KpiCard';
import StatusChip, {StockStatus} from '../components/StatusChip';
import Fab from '../components/Fab';
import AdjustStockSheet from '../components/AdjustStockSheet';

interface InventoryScreenProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onAvatarPress?: () => void;
  visibleTabs?: NavTab[];
}

function stockStatus(p: Product): StockStatus {
  if (p.stock <= 0) return 'out_of_stock';
  if (p.stock <= p.min_stock) return 'low_stock';
  return 'in_stock';
}

export default function InventoryScreen({
  activeTab,
  onTabChange,
  onAvatarPress,
  visibleTabs,
}: InventoryScreenProps) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const user = useAuthStore(s => s.user);
  const canAdjustStock = user?.permissions.includes('inventory:adjust') ?? false;
  const canCreateProduct = user?.permissions.includes('products:create') ?? false;

  const loadInventory = useCallback(async () => {
    setLoading(true);
    const prodRes = await searchProducts({limit: 50}).catch(() => null);
    const cats = await getCategories().catch(() => null);
    if (prodRes) setProducts(prodRes.items);
    if (cats) setCategories(cats);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const kpis = useMemo(
    () => ({
      totalItems: products.length.toLocaleString('es-MX'),
      outOfStock: String(products.filter(p => p.stock <= 0).length),
      categories: `${categories.length} ${categories.length === 1 ? 'activa' : 'activas'}`,
    }),
    [products, categories],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(p => {
      const mCat = activeCategory === 'all' || p.category_id === activeCategory;
      const mQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q) ||
        (p.internal_code ?? '').toLowerCase().includes(q);
      return mCat && mQ;
    });
  }, [products, query, activeCategory]);

  return (
    <div className="flex h-full w-full flex-col bg-[var(--color-background)]">
      <TopAppBar title="Inventario" onAvatarPress={onAvatarPress} />

      {/* Búsqueda + filtro */}
      <div className="px-4 pt-3">
        <SearchInput placeholder="Buscar productos, SKUs…" value={query} onChangeText={setQuery} testID="search-inventory" />
        <div className="mt-2 flex flex-wrap gap-2">
          <FilterChip label="Todos" active={activeCategory === 'all'} onPress={() => setActiveCategory('all')} />
          {categories.map(cat => (
            <FilterChip key={cat.id} label={cat.name} active={activeCategory === cat.id} onPress={() => setActiveCategory(cat.id)} />
          ))}
        </div>

        {/* KPIs */}
        <div className="mt-3 flex gap-2">
          <KpiCard label="Total items" value={kpis.totalItems} />
          <KpiCard label="Agotados" value={kpis.outOfStock} alert={Number(kpis.outOfStock) > 0} />
          <KpiCard label="Categorías" value={kpis.categories} />
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 space-y-2 overflow-y-auto p-4 pb-24">
        <h3 className="text-[var(--font-medium)] font-bold text-[var(--color-text)]">Catálogo de productos</h3>
        {loading ? (
          <p className="py-6 text-center text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
            Cargando inventario…
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-[var(--font-regular)] text-[var(--color-text-secondary)]">
            No hay productos para «{query}» o el servidor no está disponible
          </p>
        ) : (
          filtered.map(p => (
            <button
              key={p.id}
              className={`glass-surface flex w-full items-center gap-3 rounded-[var(--radius-lg)] p-3 text-left transition-colors ${
                canAdjustStock ? 'hover:bg-[var(--color-primary-soft)]' : ''
              }`}
              onClick={canAdjustStock ? () => setAdjustProduct(p) : undefined}
              data-testid={`row-${p.id}`}
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-soft)] text-xl font-black text-[var(--color-primary)]">
                {p.name.charAt(0)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[var(--font-regular)] font-semibold text-[var(--color-text)]">
                  {p.name}
                </span>
                <span className="block text-[var(--font-small)] text-[var(--color-text-secondary)]">
                  {p.sku ?? p.internal_code} · Stock: {p.stock}
                </span>
              </span>
              <StatusChip status={stockStatus(p)} testID={`status-${p.id}`} />
            </button>
          ))
        )}
      </div>

      {/* Ajustar stock */}
      {canAdjustStock && (
        <AdjustStockSheet product={adjustProduct} onClose={() => setAdjustProduct(null)} onAdjusted={loadInventory} />
      )}

      {/* FAB crear producto (Admin) */}
      {canCreateProduct && (
        <Fab variant="add" onPress={() => window.alert('Crear producto: próximamente')} testID="fab-add-product" />
      )}

      <BottomNavBar active={activeTab} onChange={onTabChange} visibleTabs={visibleTabs} />
    </div>
  );
}