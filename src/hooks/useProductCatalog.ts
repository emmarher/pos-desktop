/**
 * hooks/useProductCatalog.ts — Carga del catálogo de productos con paginación
 * y búsqueda en el BACKEND.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Por qué existe (bug corregido):
 *   Antes la UI pedía `GET /products?limit=100` (que el server recortaba a 50)
 *   y filtraba en memoria. Con eso:
 *     - el catálogo se cortaba en 50 y los productos nuevos (nombre "C…", "T…")
 *       NUNCA aparecían → "creo un producto y no aparece",
 *     - el buscador solo veía los 50 cargados → "Cebolla" decía que no existía,
 *     - el filtro de UI no buscaba por `barcode` (el backend sí).
 *
 * Ahora:
 *   - la búsqueda y el filtro por categoría van al servidor (`q`, `category_id`),
 *   - el catálogo se trae PAGINADO y se va acumulando (offset) hasta cubrir
 *     el `total` que devuelve el server,
 *   - el debounce de 300 ms evita una request por tecla.
 *
 * Modos:
 *   - con texto de búsqueda → página de SEARCH_LIMIT resultados (rápida) y
 *     botón "Cargar más" si el servidor dice que hay más.
 *   - sin texto → páginas de CATALOG_PAGE_SIZE acumuladas automáticamente
 *     hasta CATALOG_MAX_AUTO_ITEMS; si aún falta, botón "Cargar más".
 * ─────────────────────────────────────────────────────────────────────
 */
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {Product} from '../models';
import {searchProducts} from '../api/endpoints';
import {ApiError} from '../api/client';
import {
  CATALOG_MAX_AUTO_ITEMS,
  CATALOG_PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
  SEARCH_LIMIT,
} from '../constants/app';

export interface ProductCatalog {
  /** Productos cargados (acumulados de todas las páginas). */
  products: Product[];
  /** Total real que reporta el servidor para la consulta actual. */
  total: number;
  /** Texto de búsqueda (con debounce al pedirlo al servidor). */
  query: string;
  /** Texto de búsqueda inmediato (lo que ve el usuario mientras escribe). */
  queryInput: string;
  setQueryInput: (text: string) => void;
  /** Busca al instante (sin esperar el debounce) — usado tras un escaneo. */
  searchNow: (text: string) => void;
  /** Categoría activa; 'all' = todas. */
  categoryId: string;
  setCategoryId: (id: string) => void;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  /** Permite reportar errores de la carga (categorías, tipos de precio). */
  setError: (message: string | null) => void;
  /** Quedan productos por cargar en el servidor. */
  hasMore: boolean;
  /** Carga la siguiente página y la agrega a la lista. */
  loadMore: () => void;
  /** Recarga desde cero (tras crear/editar/borrar). */
  reload: () => void;
  /** Parchea un producto ya cargado (p. ej. el stock tras una venta). */
  patchProduct: (id: string, patch: Partial<Product>) => void;
  /** Id del producto a resaltar (recién creado/guardado). */
  highlightId: string | null;
  setHighlightId: (id: string | null) => void;
}

function errMsg(err: unknown): string {
  return err instanceof ApiError ? err.message : String(err);
}

export function useProductCatalog(): ProductCatalog {
  const [queryInput, setQueryInput] = useState('');
  /* `query` es la versión con debounce: la que va al servidor. */
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('all');

  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  /* petición en vuelo: se cancela si el usuario sigue escribiendo */
  const requestSeq = useRef(0);

  /* ── debounce de la búsqueda (SEARCH_DEBOUNCE_MS) ───────────────── */
  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [queryInput]);

  /* ── carga inicial / recarga (cambia q, categoría o reloadToken) ─── */
  const isSearchMode = query.length > 0;
  const pageSize = isSearchMode ? SEARCH_LIMIT : CATALOG_PAGE_SIZE;

  const loadFirstPage = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await searchProducts({
        q: query || undefined,
        category_id: categoryId === 'all' ? undefined : categoryId,
        limit: pageSize,
        offset: 0,
      });
      if (seq !== requestSeq.current) return; /* respuesta obsoleta */
      setProducts(res.items);
      setTotal(res.total);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(errMsg(err));
      setProducts([]);
      setTotal(0);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [query, categoryId, pageSize]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage, reloadToken]);

  /* ── acumulación automática de páginas (modo browse) ─────────────── */
  const autoLoading = useRef(false);
  useEffect(() => {
    if (loading || loadingMore || isSearchMode) return;
    if (products.length >= total) return;
    if (products.length >= CATALOG_MAX_AUTO_ITEMS) return;
    if (autoLoading.current) return;
    autoLoading.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await searchProducts({
          q: undefined,
          category_id: categoryId === 'all' ? undefined : categoryId,
          limit: CATALOG_PAGE_SIZE,
          offset: products.length,
        });
        if (cancelled) return;
        setProducts(prev => {
          /* evita duplicados si el server cambió entre páginas */
          const seen = new Set(prev.map(p => p.id));
          const fresh = res.items.filter(p => !seen.has(p.id));
          return [...prev, ...fresh];
        });
        setTotal(res.total);
      } catch {
        /* si falla una página extra, se conserva lo ya cargado */
      } finally {
        autoLoading.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, loadingMore, isSearchMode, products.length, total, categoryId]);

  /* ── "Cargar más" manual ────────────────────────────────────────── */
  const loadMore = useCallback(() => {
    if (loading || loadingMore) return;
    setLoadingMore(true);
    void (async () => {
      try {
        const res = await searchProducts({
          q: query || undefined,
          category_id: categoryId === 'all' ? undefined : categoryId,
          limit: pageSize,
          offset: products.length,
        });
        setProducts(prev => {
          const seen = new Set(prev.map(p => p.id));
          const fresh = res.items.filter(p => !seen.has(p.id));
          return [...prev, ...fresh];
        });
        setTotal(res.total);
      } catch (err) {
        setError(errMsg(err));
      } finally {
        setLoadingMore(false);
      }
    })();
  }, [loading, loadingMore, query, categoryId, pageSize, products.length]);

  const reload = useCallback(() => setReloadToken(t => t + 1), []);

  const patchProduct = useCallback((id: string, patch: Partial<Product>) => {
    setProducts(prev => prev.map(p => (p.id === id ? {...p, ...patch} : p)));
  }, []);

  /* Busca al instante: setea queryInput Y query sin esperar el debounce de
     300 ms (el escáner quiere ver el resultado de inmediato). */
  const searchNow = useCallback((text: string) => {
    const t = text.trim();
    setQueryInput(text);
    setQuery(t);
  }, []);

  const hasMore = useMemo(() => products.length < total, [products.length, total]);

  return {
    products,
    total,
    query,
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
    highlightId,
    setHighlightId,
  };
}
