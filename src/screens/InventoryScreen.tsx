/**
 * screens/InventoryScreen.tsx — Gestión de inventario (spec 4.3).
 *
 * Portado de pos-mobile a React DOM/Tailwind. Datos reales del backend:
 * lista de productos, KPIs (total/agotados/categorías), filtro por
 * categoría, y CRUD de productos (crear/editar/eliminar), ajustar stock.
 * Los permisos productos:create/update/delete e inventory:adjust vienen
 * del JWT. Si la carga falla se muestra el error real + botón Reintentar.
 */
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Pencil, Settings2, Trash2} from 'lucide-react';
import type {Category, Product} from '../models';
import {getCategories, deleteProduct} from '../api/endpoints';
import {ApiError} from '../api/client';
import {toast} from '../hooks/useToast';
import {useAuthStore} from '../stores/auth.store';
import {useProductCatalog} from '../hooks/useProductCatalog';
import BottomNavBar, {NavTab} from '../components/BottomNavBar';
import TopAppBar from '../components/TopAppBar';
import SearchInput from '../components/SearchInput';
import FilterChip from '../components/FilterChip';
import KpiCard from '../components/KpiCard';
import ProductThumb from '../components/ProductThumb';
import StatusChip, {StockStatus} from '../components/StatusChip';
import Fab from '../components/Fab';
import AdjustStockSheet from '../components/AdjustStockSheet';
import ProductFormSheet from '../components/ProductFormSheet';
import CategorySheet from '../components/CategorySheet';

interface InventoryScreenProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onLogout?: () => void;
  visibleTabs?: NavTab[];
}

/** Estado del formulario crear/editar. */
interface FormState {
  visible: boolean;
  mode: 'create' | 'edit';
  initial?: Product | null;
}

function stockStatus(p: Product): StockStatus {
  if (p.stock <= 0) return 'out_of_stock';
  if (p.stock <= p.min_stock) return 'low_stock';
  return 'in_stock';
}

/** Extrae un mensaje legible de cualquier error. */
function errMsg(err: unknown): string {
  return err instanceof ApiError ? err.message : String(err);
}

export default function InventoryScreen({
  activeTab,
  onTabChange,
  onLogout,
  visibleTabs,
}: InventoryScreenProps) {
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>({visible: false, mode: 'create'});
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  /* Catálogo: búsqueda + filtro por categoría van al BACKEND y la lista llega
     paginada. (Antes: limit=100 —recortado a 50 por el server— y filtro en
     memoria, así que los productos nuevos "C…"/"T…" no aparecían nunca.) */
  const {
    products,
    total,
    query,
    queryInput,
    setQueryInput,
    categoryId,
    setCategoryId,
    loading,
    loadingMore,
    error,
    setError,
    hasMore,
    loadMore,
    reload,
    highlightId,
    setHighlightId,
  } = useProductCatalog();

  const [categories, setCategories] = useState<Category[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);

  const user = useAuthStore(s => s.user);
  const canAdjustStock = user?.permissions.includes('inventory:adjust') ?? false;
  const canCreateProduct = user?.permissions.includes('products:create') ?? false;
  const canEditProduct = user?.permissions.includes('products:update') ?? false;
  const canDeleteProduct = user?.permissions.includes('products:delete') ?? false;
  const canManageCategories = user?.permissions.includes('categories:manage') ?? false;

  const loadInventory = useCallback(async () => {
    try {
      setCategories(await getCategories());
    } catch (err) {
      setError(errMsg(err));
    }
  }, []);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const kpis = useMemo(
    () => ({
      totalItems: (query ? products.length : total).toLocaleString('es-MX'),
      outOfStock: String(products.filter(p => p.stock <= 0).length),
      categories: `${categories.length} ${categories.length === 1 ? 'activa' : 'activas'}`,
    }),
    [products, categories, query, total],
  );

  const handleDelete = async (p: Product) => {
    // Confirmación con window.confirm está ok (acción destructiva); el error
    // se notifica vía toast (no window.alert).
    if (!window.confirm(`¿Eliminar "${p.name}" del catálogo? Esta acción es permanente.`)) {
      return;
    }
    try {
      await deleteProduct(p.id);
      reload();
    } catch (err) {
      toast.error(`Error al eliminar: ${errMsg(err)}`);
    }
  };

  /* Al guardar un producto: recargar y resaltar la fila nueva. */
  const handleProductSaved = useCallback(
    (productId?: string) => {
      reload();
      setHighlightId(productId ?? null);
      if (productId) {
        /* el scroll ocurre tras el render de la lista recargada */
        window.setTimeout(() => {
          const el = document.querySelector(`[data-testid="row-${productId}"]`);
          el?.scrollIntoView({behavior: 'smooth', block: 'center'});
        }, 400);
      }
    },
    [reload, setHighlightId],
  );

  const hasCriticalError = !!error && products.length === 0;

  return (
    <div className="flex h-full w-full flex-col bg-[var(--color-background)]">
      <TopAppBar title="Inventario" onLogout={onLogout} />

      {/* Banner de error si hay datos previos */}
      {error && !hasCriticalError && (
        <div className="flex items-center gap-3 border-b border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-4 py-2">
          <span className="flex-1 text-[var(--font-small)] font-semibold text-[var(--color-danger)]">{error}</span>
          <button
            className="rounded-[var(--radius-md)] border border-[var(--color-danger)] px-2 py-1 text-[var(--font-small)] font-semibold text-[var(--color-danger)] hover:opacity-70"
            onClick={() => void loadInventory()}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Búsqueda + filtro */}
      <div className="px-4 pt-3">
        <SearchInput
          placeholder="Buscar productos, SKUs…"
          value={queryInput}
          onChangeText={setQueryInput}
          testID="search-inventory"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <FilterChip label="Todos" active={categoryId === 'all'} onPress={() => setCategoryId('all')} />
          {categories.map(cat => (
            <FilterChip key={cat.id} label={cat.name} active={categoryId === cat.id} onPress={() => setCategoryId(cat.id)} />
          ))}
          {/* Gestionar categorías (solo con permiso categories:manage) */}
          {canManageCategories && (
            <button
              className="flex items-center gap-1 rounded-full border border-dashed border-[var(--color-border)] px-3 py-1.5 text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              onClick={() => setCategoriesOpen(true)}
              title="Crear o editar categorías"
              data-testid="manage-categories"
            >
              <Settings2 size={14} />
              Gestionar
            </button>
          )}
        </div>

        {/* KPIs */}
        <div className="mt-3 flex gap-2">
          <KpiCard label="Total items" value={kpis.totalItems} />
          <KpiCard label="Agotados" value={kpis.outOfStock} alert={Number(kpis.outOfStock) > 0} />
          <KpiCard label="Categorías" value={kpis.categories} />
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 space-y-2 overflow-y-auto p-4 pb-24" ref={listRef}>
        <h3 className="text-[var(--font-medium)] font-bold text-[var(--color-text)]">Catálogo de productos</h3>

        {loading ? (
          <p className="py-6 text-center text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
            Cargando inventario…
          </p>
        ) : hasCriticalError ? (
          <div className="glass-surface rounded-lg p-6 text-center">
            <p className="mb-3 text-[var(--font-regular)] font-semibold text-[var(--color-danger)]">{error}</p>
            <button
              className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-6 py-2.5 text-[var(--font-regular)] font-semibold text-[var(--color-on-primary)] hover:opacity-90"
              onClick={() => {
                reload();
                void loadInventory();
              }}
            >
              Reintentar
            </button>
          </div>
        ) : products.length === 0 ? (
          <p className="py-6 text-center text-[var(--font-regular)] text-[var(--color-text-secondary)]">
            {error && !hasCriticalError ? error.charAt(0).toUpperCase() + error.slice(1) : `No hay productos para «${queryInput}»`}
          </p>
        ) : (
          <>
            {products.map(p => (
              <div
                key={p.id}
                className={`glass-surface flex w-full items-center gap-3 rounded-[var(--radius-lg)] p-3 transition-shadow ${
                  highlightId === p.id ? 'ring-2 ring-[var(--color-primary)]' : ''
                }`}
                data-testid={`row-${p.id}`}
              >
                <ProductThumb name={p.name} imagenUrl={p.imagen_url} size={48} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[var(--font-regular)] font-semibold text-[var(--color-text)]">
                    {p.name}
                  </span>
                  <span className="block text-[var(--font-small)] text-[var(--color-text-secondary)]">
                    {p.sku ?? p.internal_code} · Stock: {p.stock}
                  </span>
                </span>
                <StatusChip status={stockStatus(p)} testID={`status-${p.id}`} />

                {/* Acciones por fila */}
                <div className="flex shrink-0 items-center gap-1">
                  {canAdjustStock && (
                    <button
                      className="rounded-[var(--radius-md)] bg-[var(--color-secondary)]/60 px-3 py-2 text-[var(--font-small)] font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--color-primary-dark)]"
                      onClick={() => setAdjustProduct(p)}
                      data-testid={`ajustar-${p.id}`}
                    >
                      Ajustar stock
                    </button>
                  )}
                  {canEditProduct && (
                    <button
                      className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-primary)]"
                      onClick={() => setForm({visible: true, mode: 'edit', initial: p})}
                      title="Editar producto"
                      data-testid={`editar-${p.id}`}
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                  {canDeleteProduct && (
                    <button
                      className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-danger)]"
                      onClick={() => void handleDelete(p)}
                      title="Eliminar producto"
                      data-testid={`eliminar-${p.id}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Paginación: botón "Cargar más" si el servidor reporta más. */}
            {hasMore && (
              <div className="flex justify-center py-4">
                <button
                  className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-6 py-2.5 text-[var(--font-regular)] font-semibold text-[var(--color-text-primary)] hover:opacity-80 disabled:opacity-50"
                  onClick={loadMore}
                  disabled={loadingMore}
                  data-testid="load-more-inventory"
                >
                  {loadingMore ? 'Cargando…' : `Cargar más (${products.length} de ${total})`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Gestión de categorías */}
      {categoriesOpen && (
        <CategorySheet onClose={() => setCategoriesOpen(false)} onChanged={loadInventory} />
      )}

      {/* Formulario crear/editar */}
      {form.visible && (
        <ProductFormSheet
          mode={form.mode}
          initial={form.mode === 'edit' ? form.initial : null}
          onClose={() => setForm({visible: false, mode: 'create', initial: null})}
          onSaved={handleProductSaved}
        />
      )}

      {/* Ajustar stock */}
      {canAdjustStock && (
        <AdjustStockSheet product={adjustProduct} onClose={() => setAdjustProduct(null)} onAdjusted={reload} />
      )}

      {/* FAB crear producto (solo con permiso) */}
      {canCreateProduct && (
        <Fab variant="add" onPress={() => setForm({visible: true, mode: 'create', initial: null})} testID="fab-add-product" />
      )}

      <BottomNavBar active={activeTab} onChange={onTabChange} visibleTabs={visibleTabs} />
    </div>
  );
}