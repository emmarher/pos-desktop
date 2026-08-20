/**
 * api/endpoints.ts — Puntos de acceso a la API del servidor (sección 8.2 del PRD).
 *
 * ────────────────────────────────────────────────────────────────────────
 * Qué hace este archivo:
 *   Centraliza TODAS las llamadas HTTP del frontend. Cada función está
 *   tipada con el modelo correspondiente (src/models). Ningún screen
 *   construye URLs ni llama fetch directamente.
 *
 *   Endpoints cubiertos hoy (MVP):
 *     - Auth:        POST /auth/login, POST /auth/refresh
 *     - Productos:   GET /products (búsqueda por nombre/código)
 *     - Clientes:    GET /customers (búsqueda)
 *     - Ventas:      POST /sales, POST /sales/:id/cancel
 *     - Impresión:   POST /print-jobs, GET /print-jobs, PATCH /print-jobs/:id
 *     - Báscula:     GET /scale/current?device_id=X
 *     - QoS:         POST /service-quality/:id
 * ────────────────────────────────────────────────────────────────────────
 */
import {
  AuthResponse,
  Category,
  CreateSalePayload,
  CustomerSearchResponse,
  MeasurementUnit,
  PrintJob,
  PriceType,
  Product,
  ProductSearchResponse,
  SaleResponse,
  ScaleReading,
  ServiceQualityEvent,
} from '../models';
import {apiRequest} from './client';

/* ──────────────────────────────────────────────────────────────────────
 * AUTH Y LICENCIA
 *   login(): tenant_code + PIN + datos del dispositivo. El servidor
 *   valida licencia activa y límite de dispositivos (RF-AU-002/004).
 * ────────────────────────────────────────────────────────────────────── */
export interface LoginRequest {
  tenant_code: string;
  pin: string;
  /** Identificador persistente del dispositivo (RF-AU-004) */
  device_id: string;
  device_name: string;
  device_type: 'TABLET' | 'PC';
}

export function login(body: LoginRequest): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body,
    auth: false, // aún no hay token
  });
}

/* ──────────────────────────────────────────────────────────────────────
 * CATÁLOGO Y BÚSQUEDA DE PRODUCTOS
 *   Búsqueda por nombre / internal_code / barcode (RF-CA-006).
 *   El debounce de 300ms y el límite de 20 resultados los aplica la UI
 *   (ver constants/app.ts).
 * ────────────────────────────────────────────────────────────────────── */
export interface ProductSearchParams {
  /** Búsqueda por nombre/internal_code/barcode */
  q?: string;
  category_id?: string;
  limit?: number;
  offset?: number;
}

export function searchProducts(
  params: ProductSearchParams,
): Promise<ProductSearchResponse> {
  const qs = new URLSearchParams();
  if (params.q) {
    qs.set('q', params.q);
  }
  if (params.category_id) {
    qs.set('category_id', params.category_id);
  }
  qs.set('limit', String(params.limit ?? 20));
  qs.set('offset', String(params.offset ?? 0));
  return apiRequest<ProductSearchResponse>(`/products?${qs.toString()}`);
}

/* ──────────────────────────────────────────────────────────────────────
 * CREACIÓN DE PRODUCTOS (RF-CA-002) — solo con permiso products:create
 * ────────────────────────────────────────────────────────────────────── */

/** Precio de un tipo de precio al crear el producto (RF-CA-004). */
export interface ProductInputPrices {
  price_type_id: string;
  price: number;
  min_quantity?: number;
}

/** Body de POST /products (espejo de productCreateBodySchema del backend). */
export interface CreateProductInput {
  name: string;
  category_id?: string | null;
  description?: string | null;
  barcode?: string | null;
  internal_code?: string | null;
  sku?: string | null;
  base_unit_id: string;
  sale_unit_id: string;
  unit_conversion?: number;
  price?: number;
  cost?: number;
  min_stock?: number;
  max_stock?: number | null;
  is_scale_enabled?: boolean;
  allow_fractional_sale?: boolean;
  is_active?: boolean;
  prices?: ProductInputPrices[];
}

/** POST /products — crea producto + precios (permiso products:create). */
export function createProduct(input: CreateProductInput): Promise<Product> {
  return apiRequest<Product>('/products', {method: 'POST', body: input});
}

/** GET /measurement-units — unidades de medida del catálogo (RF-UM). */
export function getMeasurementUnits(): Promise<MeasurementUnit[]> {
  return apiRequest<MeasurementUnit[]>('/measurement-units');
}

/** GET /categories — categorías activas del tenant (RF-CA-001). */
export function getCategories(): Promise<Category[]> {
  return apiRequest<Category[]>('/categories');
}

/** GET /price-types — tipos de precio del tenant (RF-CA-003). */
export function getPriceTypes(): Promise<PriceType[]> {
  return apiRequest<PriceType[]>('/price-types');
}

/* ──────────────────────────────────────────────────────────────────────
 * CLIENTES
 *   Búsqueda para asociar cliente a la venta (RF-VE-005: crédito).
 * ────────────────────────────────────────────────────────────────────── */
export function searchCustomers(q: string): Promise<CustomerSearchResponse> {
  const qs = new URLSearchParams({q, limit: '10'});
  return apiRequest<CustomerSearchResponse>(`/customers?${qs.toString()}`);
}

/* ──────────────────────────────────────────────────────────────────────
 * VENTAS
 *   createSale: envía el payload del carrito (Fase 5). El servidor
 *     ejecuta la transacción atómica, asigna folio y descuenta stock.
 *   cancelSale: cancela con motivo (solo con permiso sales:cancel).
 * ────────────────────────────────────────────────────────────────────── */
export function createSale(payload: CreateSalePayload): Promise<SaleResponse> {
  return apiRequest<SaleResponse>('/sales', {method: 'POST', body: payload});
}

export function cancelSale(
  id: string,
  reason: string,
): Promise<SaleResponse> {
  return apiRequest<SaleResponse>(`/sales/${id}/cancel`, {
    method: 'POST',
    body: {reason},
  });
}

/* ──────────────────────────────────────────────────────────────────────
 * IMPRESIÓN DELEGADA (RF-IM)
 *   enqueuePrintJob: este dispositivo encola; el dispositivo con
 *     impresora hace polling y ejecuta (RF-IM-002).
 *   getPendingPrintJobs: usado por el dispositivo con can_print=true
 *     (polling cada 2s).
 *   updatePrintJob: marcar COMPLETED/FAILED tras imprimir.
 * ────────────────────────────────────────────────────────────────────── */
export function enqueuePrintJob(
  target_device_id: string,
  content: string,
): Promise<PrintJob> {
  return apiRequest<PrintJob>('/print-jobs', {
    method: 'POST',
    body: {target_device_id, content},
  });
}

export function getPendingPrintJobs(
  target_device_id: string,
): Promise<PrintJob[]> {
  return apiRequest<PrintJob[]>(
    `/print-jobs?target_device_id=${target_device_id}&status=PENDING`,
  );
}

export function updatePrintJob(
  id: string,
  status: 'COMPLETED' | 'FAILED' | 'PRINTING',
): Promise<PrintJob> {
  return apiRequest<PrintJob>(`/print-jobs/${id}`, {
    method: 'PATCH',
    body: {status},
  });
}

/* ──────────────────────────────────────────────────────────────────────
 * BÁSCULA DELEGADA (RF-BA)
 *   getScaleReading: solicita el último peso cacheado del dispositivo
 *     con báscula (RF-BA-003). Si no responde → input manual.
 * ────────────────────────────────────────────────────────────────────── */
export function getScaleReading(
  device_id: string,
): Promise<ScaleReading> {
  return apiRequest<ScaleReading>(`/scale/current?device_id=${device_id}`);
}

/* ──────────────────────────────────────────────────────────────────────
 * CALIDAD DE SERVICIO (RF-QS)
 *   submitQosSurvey: envía la calificación del cliente (1-5 estrellas)
 *     y el comentario opcional. Marca el evento como COMPLETED.
 * ────────────────────────────────────────────────────────────────────── */
export function submitQosSurvey(
  eventId: string,
  rating: number,
  comment?: string,
): Promise<ServiceQualityEvent> {
  return apiRequest<ServiceQualityEvent>(`/service-quality/${eventId}`, {
    method: 'POST',
    body: {rating, comment},
  });
}
