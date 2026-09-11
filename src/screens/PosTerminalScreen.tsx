/**
 * screens/PosTerminalScreen.tsx — Terminal de ventas / Caja (spec 4.2).
 *
 * Portado de pos-mobile a React DOM/Tailwind. Búsqueda, categorías,
 * catálogo grid, sheet de cantidad (3 precios), carrito y POST /sales
 * (vía Rust).
 */
import {useCallback, useEffect, useMemo, useState} from 'react';
import type {Category, PriceType, Product} from '../models';
import {searchProducts, getCategories, getPriceTypes} from '../api/endpoints';
import {ApiError} from '../api/client';
import {useCartStore} from '../stores/cart.store';
import {useAuthStore} from '../stores/auth.store';
import BottomNavBar, {NavTab} from '../components/BottomNavBar';
import TopAppBar from '../components/TopAppBar';
import SearchInput from '../components/SearchInput';
import FilterChip from '../components/FilterChip';
import ProductCard from '../components/ProductCard';
import ProductSheet from '../components/ProductSheet';
import CartSheet from '../components/CartSheet';
import Fab from '../components/Fab';
import type {CartItem} from '../models';
import {getScaleDeviceId} from '../lib/scale';

interface PosTerminalScreenProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onLogout?: () => void;
  visibleTabs?: NavTab[];
}

export default function PosTerminalScreen({
  activeTab,
  onTabChange,
  onLogout,
  visibleTabs,
}: PosTerminalScreenProps) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  /* Carrito: sidecar persistente en pantallas anchas; FAB + collar en estrechas. */
  const [cartCollapsed, setCartCollapsed] = useState(false);
  /* Detectar ancho de ventana para modo sidecar (wide) vs FAB (narrow). */
  const SIDECAR_BREAKPOINT = 768; /* >=768px → sidecar; <768px → FAB */
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  const isWideScreen = windowWidth >= SIDECAR_BREAKPOINT;

  /* En pantallas estrechas, el carrito comienza minimizado (collar) hasta que
     el usuario lo abre con el FAB. */
  useEffect(() => {
    if (!isWideScreen) setCartCollapsed(true);
  }, [isWideScreen]);

  /* Escuchar resize para alternar entre sidecar y FAB automáticamente. */
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [priceTypes, setPriceTypes] = useState<PriceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cartCount = useCartStore(s => s.items.length);
  const user = useAuthStore(s => s.user);

  /* device_id de la báscula si esta máquina la tiene registrada (HardwareScreen). */
  const scaleDeviceId = getScaleDeviceId() ?? undefined;

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prodRes, cats, pts] = await Promise.all([
        searchProducts({limit: 50}),
        getCategories(),
        getPriceTypes(),
      ]);
      if (prodRes.items.length > 0) setProducts(prodRes.items);
      if (cats.length > 0) setCategories(cats);
      if (pts.length > 0) setPriceTypes(pts);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog, user]);

  /* RF-VE-003: al confirmar venta, el stock local se actualiza al instante
     (el backend también descuenta ATOMIC; aquí reflejamos en el grid). */
  const handleSaleDone = (_sale: {folio: string; id: string; items: CartItem[]}) => {
    const clearProduct = (p: Product) => {
      const sold = _sale.items.find(it => it.product.id === p.id);
      if (!sold) return p;
      const newStock = Math.max(0, (p.stock ?? 0) - sold.quantity);
      return {...p, stock: newStock};
    };
    setProducts(prev => prev.map(clearProduct));
    setSelectedProduct(null);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(pr => {
      const mCat = activeCategory === 'all' || pr.category_id === activeCategory;
      const mQ =
        !q ||
        pr.name.toLowerCase().includes(q) ||
        (pr.sku ?? '').toLowerCase().includes(q) ||
        (pr.internal_code ?? '').toLowerCase().includes(q);
      return mCat && mQ;
    });
  }, [products, query, activeCategory]);

  return (
    <div className="flex h-full w-full flex-col bg-[var(--color-background)]">
      <TopAppBar title="Terminal de ventas" onLogout={onLogout} />

      {/* Búsqueda + categorías */}
      <div className="px-4 pt-3">
        <SearchInput placeholder="Buscar productos…" value={query} onChangeText={setQuery} testID="search-products" />
        <div className="mt-2 flex flex-wrap gap-2">
          {categories.map(cat => (
            <FilterChip
              key={cat.id}
              label={cat.name}
              active={activeCategory === cat.id}
              onPress={() => setActiveCategory(cat.id)}
              testID={`chip-${cat.id}`}
            />
          ))}
        </div>
      </div>

      {/* Catálogo en grid (deja espacio para el carrito lateral cuando está expandido) */}
      <div className={`relative flex-1 overflow-y-auto p-4 pb-24 ${
        /* Deja espacio para el sidecar solo cuando está expandido */
        !cartCollapsed ? 'pr-[320px]' : ''
      }`}>
        {loading ? (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
              Cargando productos…
            </span>
          </div>
        ) : error && products.length === 0 ? (
          <div className="glass-surface mx-auto mt-12 max-w-sm rounded-lg p-6 text-center">
            <p className="mb-3 text-[var(--font-regular)] font-semibold text-[var(--color-danger)]">{error}</p>
            <button
              className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-6 py-2.5 text-[var(--font-regular)] font-semibold text-[var(--color-on-primary)] hover:opacity-90"
              onClick={() => void loadCatalog()}
            >
              Reintentar
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="pt-12 text-center text-[var(--font-regular)] font-semibold text-[var(--color-text-secondary)]">
            No hay productos para «{query}»
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filtered.map(item => (
              <ProductCard key={item.id} product={item} onPress={() => setSelectedProduct(item)} testID={`product-${item.id}`} />
            ))}
          </div>
        )}
      </div>

      {/* Sheets (producto) */}
      <ProductSheet
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        priceTypes={priceTypes}
        scaleDeviceId={scaleDeviceId}
      />

      {/* Carrito lateral persistente (RF-VE-001) — siempre visible.
          En pantallas estrechas comienza minimizado; el FAB lo abre. */}
      <CartSheet
        collapsed={cartCollapsed}
        onToggleCollapse={() => setCartCollapsed(!cartCollapsed)}
        onSaleDone={handleSaleDone}
      />

      {/* FAB carrito — solo en pantallas estrechas (< 768px) */}
      {!isWideScreen && (
        <Fab
          onPress={() => setCartCollapsed(!cartCollapsed)}
          badgeCount={cartCount}
          testID="fab-cart"
        />
      )}

      {/* Navegación inferior */}
      <BottomNavBar active={activeTab} onChange={onTabChange} cartCount={cartCount} visibleTabs={visibleTabs} />
    </div>
  );
}