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

interface PosTerminalScreenProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onAvatarPress?: () => void;
  visibleTabs?: NavTab[];
}

export default function PosTerminalScreen({
  activeTab,
  onTabChange,
  onAvatarPress,
  visibleTabs,
}: PosTerminalScreenProps) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartVisible, setCartVisible] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [priceTypes, setPriceTypes] = useState<PriceType[]>([]);
  const [loading, setLoading] = useState(true);

  const cartCount = useCartStore(s => s.items.length);
  const user = useAuthStore(s => s.user);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    const prodRes = await searchProducts({limit: 50}).catch(() => null);
    const cats = await getCategories().catch(() => null);
    const pts = await getPriceTypes().catch(() => null);
    if (prodRes && prodRes.items.length > 0) setProducts(prodRes.items);
    if (cats && cats.length > 0) setCategories(cats);
    if (pts && pts.length > 0) setPriceTypes(pts);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog, user]);

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
      <TopAppBar title="Terminal de ventas" onAvatarPress={onAvatarPress} />

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

      {/* Catálogo en grid */}
      <div className="relative flex-1 overflow-y-auto p-4 pb-24">
        {loading ? (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
              Cargando productos…
            </span>
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

      {/* Sheets */}
      <ProductSheet product={selectedProduct} onClose={() => setSelectedProduct(null)} priceTypes={priceTypes} />
      <CartSheet visible={cartVisible} onClose={() => setCartVisible(false)} />

      {/* FAB carrito */}
      <Fab onPress={() => setCartVisible(true)} badgeCount={cartCount} testID="fab-cart" />

      {/* Navegación inferior */}
      <BottomNavBar active={activeTab} onChange={onTabChange} cartCount={cartCount} visibleTabs={visibleTabs} />
    </div>
  );
}