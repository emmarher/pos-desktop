/**
 * screens/PosTerminalScreen.tsx — Terminal de ventas / Caja (spec 4.2).
 *
 * Portado de pos-mobile a React DOM/Tailwind. Búsqueda, categorías,
 * catálogo grid, sheet de cantidad (3 precios), carrito y POST /sales
 * (vía Rust).
 */
import {useCallback, useEffect, useRef, useState} from 'react';
import type {Category, PriceType, Product} from '../models';
import {getCategories, getPriceTypes, searchProducts} from '../api/endpoints';
import {ApiError} from '../api/client';
import {useCartStore} from '../stores/cart.store';
import {useAuthStore} from '../stores/auth.store';
import {useProductCatalog} from '../hooks/useProductCatalog';
import BottomNavBar, {NavTab} from '../components/BottomNavBar';
import TopAppBar from '../components/TopAppBar';
import SearchInput from '../components/SearchInput';
import FilterChip from '../components/FilterChip';
import ProductCard from '../components/ProductCard';
import ProductSheet from '../components/ProductSheet';
import CartSheet from '../components/CartSheet';
import Fab from '../components/Fab';
import type {CartItem} from '../models';
import {getScaleDeviceId, isMassProduct, isCajProduct} from '../lib/scale';
import {findExactCode} from '../lib/scan';
import {getProductPrices} from '../constants/prices';
import {toast} from '../hooks/useToast';

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
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  /* Detectar ancho de ventana para modo sidecar (wide) vs FAB (narrow). */
  const SIDECAR_BREAKPOINT = 768; /* >=768px → sidecar; <768px → FAB */
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  const isWideScreen = windowWidth >= SIDECAR_BREAKPOINT;

  /* Catálogo: búsqueda y filtro van al BACKEND, con paginación real.
     (Antes se pedía limit=100 —que el server recortaba a 50— y se filtraba
      en memoria: los productos nuevos "C…"/"T…" nunca aparecían.) */
  const {
    products,
    total,
    queryInput,
    setQueryInput,
    searchNow,
    categoryId,
    setCategoryId,
    loading,
    loadingMore,
    error,
    setError,
    hasMore,
    loadMore,
    reload,
    patchProduct,
  } = useProductCatalog();

  /* Ref al input de búsqueda: tras escanear se le devuelve el foco para el siguiente código. */
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [priceTypes, setPriceTypes] = useState<PriceType[]>([]);

  const cartCount = useCartStore(s => s.items.length);
  const user = useAuthStore(s => s.user);

  /* Carrito: sidecar. Por defecto minimizado solo si está vacío al iniciar,
     pero el usuario puede abrirlo/cerrarlo libremente sin flashing.
     Al agregar el primer producto (0 → 1) se abre automáticamente. */
  const [cartCollapsed, setCartCollapsed] = useState(() => {
    const initialCount = useCartStore.getState().items.length;
    if (initialCount === 0) return true;
    return window.innerWidth < SIDECAR_BREAKPOINT;
  });
  const prevCartCountRef = useState(() => ({ current: useCartStore.getState().items.length }))[0];
  useEffect(() => {
    const prev = prevCartCountRef.current;
    if (prev === 0 && cartCount > 0) {
      setCartCollapsed(false);
    }
    prevCartCountRef.current = cartCount;
  }, [cartCount]);

  /* En pantallas estrechas forzar collar; en anchas no interferir con toggle manual. */
  useEffect(() => {
    if (!isWideScreen) setCartCollapsed(true);
  }, [isWideScreen]);

  /* Escuchar resize para alternar entre sidecar y FAB automáticamente. */
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* device_id de la báscula si esta máquina la tiene registrada (HardwareScreen). */
  const scaleDeviceId = getScaleDeviceId() ?? undefined;

  /* addItem: el scan de un COUNT lo agrega directo (cantidad 1, precio por defecto). */
  const cartAddItem = useCartStore(s => s.addItem);

  /**
   * handleScan — flujo del escáner HID (teclea el código y manda Enter).
   * 1) Busca el match EXACTO (barcode o internal_code en MAYÚSCULAS) primero
   *    en los productos ya cargados; si no aparece, pregunta al backend.
   * 2) MASS/CAJ: no se puede agregar sin peso → se abre ProductSheet para capturarlo.
   * 3) COUNT normal: agrega directo cantidad 1 con el precio por defecto.
   * 4) Sin match: toast y se deja la búsqueda visible con el código tecleado.
   */
  const handleScan = useCallback(async (code: string) => {
    const c = code.trim();
    if (!c) return;
    const loaded = findExactCode(products, c);
    let match = loaded;
    if (!match) {
      try {
        const res = await searchProducts({q: c, limit: 20});
        match = findExactCode(res.items ?? [], c);
      } catch {
        match = null;
      }
    }
    if (!match) {
      toast.error('Código no encontrado');
      searchNow(c); /* deja visible la búsqueda con el código tecleado */
      return;
    }
    /* MASS/CAJ: requieren peso → abrir el sheet para capturarlo. */
    if (isMassProduct(match) || isCajProduct(match)) {
      setSelectedProduct(match);
      searchNow(c);
      return;
    }
    if (match.stock <= 0) {
      toast.error(`«${match.name}» está agotado`);
      searchNow(c);
      return;
    }
    /* COUNT: agregar al carrito con la primera opción de precio (la default). */
    const first = getProductPrices(match, priceTypes)[0];
    const key = `${match.id}-${Date.now().toString(36)}`;
    cartAddItem({
      key,
      product: match,
      quantity: 1,
      priceType: first.priceType,
      unitPrice: first.price,
      discount: 0,
      subtotal: first.price,
      baseQuantity: match.unit_conversion,
      isCaj: false,
    });
    setQueryInput(''); /* limpia la búsqueda tras agregar */
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [products, priceTypes, cartAddItem, setQueryInput, searchNow]);

  /* Categorías y tipos de precio: son listas cortas, no paginan.
     El catálogo de productos lo carga el hook useProductCatalog. */
  const loadCatalog = useCallback(async () => {
    try {
      const [cats, pts] = await Promise.all([getCategories(), getPriceTypes()]);
      if (cats.length > 0) setCategories(cats);
      if (pts.length > 0) setPriceTypes(pts);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog, user]);

  /* RF-VE-003: al confirmar venta, el stock local se actualiza al instante
     (el backend también descuenta ATOMIC; aquí reflejamos en el grid). */
  const handleSaleDone = (_sale: {folio: string; id: string; items: CartItem[]}) => {
    _sale.items.forEach(it => {
      const current = products.find(p => p.id === it.product.id);
      if (!current) return;
      patchProduct(it.product.id, {stock: Math.max(0, (current.stock ?? 0) - it.quantity)});
    });
    setSelectedProduct(null);
  };

  return (
    <div className="flex h-full w-full flex-col bg-[var(--color-background)]">
      <TopAppBar title="Terminal de ventas" onLogout={onLogout} />

      {/* Búsqueda + categorías */}
      <div className="px-4 pt-3">
        <SearchInput
          placeholder="Buscar productos… (o escanea el código)"
          value={queryInput}
          onChangeText={setQueryInput}
          onSubmit={handleScan}
          inputRef={searchInputRef}
          autoFocus
          testID="search-products"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {categories.map(cat => (
            <FilterChip
              key={cat.id}
              label={cat.name}
              active={categoryId === cat.id}
              onPress={() => setCategoryId(categoryId === cat.id ? 'all' : cat.id)}
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
              onClick={() => {
                reload();
                void loadCatalog();
              }}
            >
              Reintentar
            </button>
          </div>
        ) : products.length === 0 ? (
          <p className="pt-12 text-center text-[var(--font-regular)] font-semibold text-[var(--color-text-secondary)]">
            No hay productos para «{queryInput}»
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {products.map(item => (
                <ProductCard key={item.id} product={item} onPress={() => setSelectedProduct(item)} testID={`product-${item.id}`} />
              ))}
            </div>

            {/* Paginación: el catálogo se trae por páginas; si el servidor
                reporta más de los cargados, botón "Cargar más". */}
            {hasMore && (
              <div className="mt-6 flex flex-col items-center gap-2">
                <button
                  className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-6 py-2.5 text-[var(--font-regular)] font-semibold text-[var(--color-text-primary)] hover:opacity-80 disabled:opacity-50"
                  onClick={loadMore}
                  disabled={loadingMore}
                  data-testid="load-more-products"
                >
                  {loadingMore ? 'Cargando…' : `Cargar más (${products.length} de ${total})`}
                </button>
              </div>
            )}
          </>
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