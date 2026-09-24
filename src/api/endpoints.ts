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
 *     - Ventas:      POST /sales, GET /sales/:id, GET /sales/:id/ticket,
 *                     GET /sales (listado), POST /sales/:id/cancel
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
  SaleDetail,
  SaleResponse,
  ScaleReading,
  ServiceQualityEvent,
  StoredTicket,
} from '../models';
import {apiRequest, apiUploadFile, ApiError} from './client';

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
    auth: false, // a�n no hay token
  });
}

/**
 * POST /auth/change-pin — cambia el PIN inicial (F-I2b instalador).
 * Sin JWT a propósito: se usa cuando /auth/login responde 403 MUST_CHANGE_PIN.
 * No emite tokens; el caller reintenta login con el PIN nuevo.
 */
export function changePin(body: {
  tenant_code: string;
  pin: string;
  new_pin: string;
}): Promise<{changed: boolean}> {
  return apiRequest<{changed: boolean}>('/auth/change-pin', {
    method: 'POST',
    body,
    auth: false,
  });
}

/**
 * Detecta el 403 MUST_CHANGE_PIN del login. El envoltorio de error no trae
 * `code` máquina (solo statusCode+message), así que se matchea por status
 * más el mensaje estable del servidor ('Debes cambiar tu PIN inicial…').
 */
export function isMustChangePin(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 403 &&
    /cambiar tu PIN|MUST_CHANGE_PIN/i.test(err.message)
  );
}

/* ──────────────────────────────────────────────────────────────────────
 * LICENCIA (renovación dentro de la app, F-I2c menú usuario)
 * ────────────────────────────────────────────────────────────────────── */

/** Estado de licencia del servidor (subset que guarda el store local). */
export interface LicenseStatus {
  status: 'active' | 'expired' | 'grace';
  expires_at: string;
  max_devices: number;
  lic_id?: string | null;
  customer?: string | null;
}

/**
 * POST /license/upload — subir (renovar/ampliar) licencia.
 * Con auth:true: envía el JWT si hay sesión (renovación por admin con
 * settings:manage); sin sesión el server lo trata como bootstrap.
 */
export function uploadLicense(licenseData: string): Promise<LicenseStatus> {
  return apiRequest<LicenseStatus>('/license/upload', {
    method: 'POST',
    body: {license_data: licenseData},
    auth: true,
  });
}

/** GET /license/status — estado actual (con auth para datos del tenant). */
export function getLicenseStatus(): Promise<LicenseStatus> {
  return apiRequest<LicenseStatus>('/license/status', {
    method: 'GET',
    auth: true,
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

/** GET /products/:id — detalle con precios (permiso products:read). */
export function getProduct(id: string): Promise<Product> {
  return apiRequest<Product>(`/products/${encodeURIComponent(id)}`);
}

/** PATCH /products/:id — actualiza producto (permiso products:update). */
export function updateProduct(
  id: string,
  input: Partial<CreateProductInput>,
): Promise<Product> {
  return apiRequest<Product>(`/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  });
}

/** DELETE /products/:id — borrado lógico (permiso products:delete). */
export function deleteProduct(id: string): Promise<Product> {
  return apiRequest<Product>(`/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/** Respuesta de los endpoints de imagen de producto. */
export interface ProductImageResponse {
  imagen_url: string | null;
}

/** MIME types de imagen aceptados por el backend. */
export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/** Tamaño máximo de imagen del backend (5 MB, S3_MAX_FILE_SIZE_MB). */
export const IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * POST /products/:id/image — sube/reemplaza la imagen (products:update).
 * multipart con campo `file`; el backend convierte a WebP y responde.
 */
export function uploadProductImage(
  id: string,
  file: {name: string; mime: string; bytes: ArrayBuffer},
): Promise<ProductImageResponse> {
  return apiUploadFile<ProductImageResponse>(
    `/products/${encodeURIComponent(id)}/image`,
    file,
  );
}

/** DELETE /products/:id/image — quita la imagen (products:update). */
export function deleteProductImage(
  id: string,
): Promise<ProductImageResponse> {
  return apiRequest<ProductImageResponse>(
    `/products/${encodeURIComponent(id)}/image`,
    {method: 'DELETE'},
  );
}

/* ──────────────────────────────────────────────────────────────────────
 * INVENTARIO — ajuste de stock (RF-IN-005, permiso inventory:adjust)
 * ────────────────────────────────────────────────────────────────────── */

/** Body de POST /inventory/adjustments. quantity: +entrada / −salida. */
export interface AdjustStockInput {
  product_id: string;
  quantity: number;
  reason: string;
  location_id?: string | null;
}

/** POST /inventory/adjustments — ajusta stock con motivo (Admin). */
export function adjustInventory(input: AdjustStockInput): Promise<unknown> {
  return apiRequest<unknown>('/inventory/adjustments', {
    method: 'POST',
    body: input,
  });
}

/* ──────────────────────────────────────────────────────────────────────
 * REPORTES (RF-PR) — solo con permiso reports:read
 * ────────────────────────────────────────────────────────────────────── */

/** Estadísticas rápidas (GET /reports/quick-stats). */
export interface QuickStats {
  today: { total_sales: number; transactions: number; average_ticket: number };
  yesterday: { total_sales: number; transactions: number };
  by_payment_method: { method: string; total: number; count: number }[];
  by_category: { category_id: string | null; category_name: string | null; total: number }[];
}

export function getQuickStats(): Promise<QuickStats> {
  return apiRequest<QuickStats>('/reports/quick-stats');
}

/** Venta del historial (GET /reports/sales-history, GET /sales). */
export interface SaleHistoryItem {
  id: string;
  folio: string;
  seller_id: string | null;
  seller_name: string | null;
  customer_name: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payment_state: string;
  /** COMPLETED | CANCELLED | REFUNDED — necesario para tickets cancelados */
  status: string;
  created_at: string;
}

/** Parámetros de filtrado para getSalesHistory y getMyTickets (folio = V-00000x prefijo). */
export interface SalesHistoryParams {
  from?: string;
  to?: string;
  seller_id?: string;
  folio?: string;
  limit?: number;
  offset?: number;
}

/** GET /reports/sales-history — reportes de ventas (admin: reports:read). */
export function getSalesHistory(
  params?: SalesHistoryParams,
): Promise<{ items: SaleHistoryItem[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  if (params?.seller_id) qs.set('seller_id', params.seller_id);
  if (params?.folio?.trim()) qs.set('folio', params.folio.trim());
  qs.set('limit', String(params?.limit ?? 20));
  if (params?.offset) qs.set('offset', String(params.offset));
  return apiRequest<{ items: SaleHistoryItem[]; total: number }>(
    `/reports/sales-history?${qs.toString()}`,
  );
}

/** GET /sales — listado de ventas (Vendedor: sales:read_own, Admin: sales:read_all). Soporta folio V-00000x. */
export function getMyTickets(
  params?: SalesHistoryParams,
): Promise<{ items: SaleHistoryItem[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  if (params?.seller_id) qs.set('seller_id', params.seller_id);
  if (params?.folio?.trim()) qs.set('folio', params.folio.trim());
  qs.set('limit', String(params?.limit ?? 20));
  if (params?.offset) qs.set('offset', String(params.offset));
  return apiRequest<{ items: SaleHistoryItem[]; total: number }>(
    `/sales?${qs.toString()}`,
  );
}

/** GET /sales/:id — detalle de venta con ítems y pagos (sales:read_own). */
export function getSale(id: string): Promise<SaleDetail> {
  return apiRequest<SaleDetail>(`/sales/${encodeURIComponent(id)}`);
}

/** GET /sales/:id/ticket — contenido ESC/POS almacenado para reimprimir. */
export function getTicketContent(saleId: string): Promise<StoredTicket> {
  return apiRequest<StoredTicket>(`/sales/${encodeURIComponent(saleId)}/ticket`);
}

/**
 * Reprimir un ticket: obtiene el contenido almacenado y lo imprime.
 *
 * Intenta primero impresión DIRECTA USB (mismo camino que usa CartSheet al
 * vender: `printTicketDirect`). La cola del servidor (`POST /print-jobs`) solo
 * se usa como fallback cuando este equipo NO tiene impresora local, porque el
 * consumidor de la cola (orquestador Rust `start_hardware`) no corre por
 * defecto en desktop — sin él, todo lo encolado queda en PENDING para siempre.
 *
 * @returns 'printed' si el spooler confirmó papel, 'unconfirmed' si se aceptó
 *   sin confirmar en ~15s, 'queued' si se delegó a la cola del servidor.
 */
export async function reprintTicket(saleId: string): Promise<'printed' | 'unconfirmed' | 'queued'> {
  const ticket = await getTicketContent(saleId);
  // Import dinámico para no crear ciclo: services/hardware no importa este módulo.
  const {printTicketDirect, getPersistedUsbPrinter} = await import('../services/hardware');
  const printer = await getPersistedUsbPrinter();
  if (printer?.printerName) {
    // Hay impresora local: imprimir directo. Si falla, el error se propaga
    // (sin encolar duplicado: el usuario reintenta desde Tickets).
    const result = await printTicketDirect(ticket.content);
    return result.outcome === 'printed' ? 'printed' : 'unconfirmed';
  }
  // Sin impresora local: delegar al dispositivo con can_print vía cola.
  await enqueuePrintJob({
    content: ticket.content,
    sale_id: saleId,
    job_type: 'SALE_TICKET',
  });
  return 'queued';
}

/** GET /measurement-units — unidades de medida del catálogo (RF-UM). */
export function getMeasurementUnits(): Promise<MeasurementUnit[]> {
  return apiRequest<MeasurementUnit[]>('/measurement-units');
}

/** GET /categories — categorías activas del tenant (RF-CA-001). */
export function getCategories(): Promise<Category[]> {
  return apiRequest<Category[]>('/categories');
}

/** Payload para crear/editar categoría (POST/PATCH /categories). */
export interface CategoryInput {
  name: string;
  prefix: string;
  description?: string | null;
  color?: string | null;
  display_order?: number;
  is_active?: boolean;
}

/** POST /categories — crear categoría (requiere categories:manage). */
export function createCategory(input: CategoryInput): Promise<Category> {
  return apiRequest<Category>('/categories', {method: 'POST', body: input});
}

/** PATCH /categories/:id — actualizar categoría (requiere categories:manage). */
export function updateCategory(
  id: string,
  input: Partial<CategoryInput>,
): Promise<Category> {
  return apiRequest<Category>(`/categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  });
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
 *   enqueuePrintJob: este dispositivo encola; el backend auto-resuelve el
 *     target_device_id (dispositivo con can_print=true) si no se pasa.
 *   getPendingPrintJobs: usado por el dispositivo con can_print=true
 *     (polling cada 2s).
 *   updatePrintJob: marcar COMPLETED/FAILED tras imprimir.
 * ────────────────────────────────────────────────────────────────────── */
/** Entrada para encolar un trabajo de impresión (RF-IM-002). */
export interface EnqueuePrintInput {
  /** Si no se pasa, el backend busca el device con can_print=true del tenant. */
  target_device_id?: string;
  content: string;
  job_type?: 'SALE_TICKET' | 'CUT_TICKET' | 'TEST' | 'Z_REPORT';
  sale_id?: string | null;
  source_device_id?: string;
}

/** Encola un trabajo de impresión (RF-IM-002). Auto-resuelve target si no se pasa. */
export function enqueuePrintJob(input: EnqueuePrintInput): Promise<PrintJob> {
  return apiRequest<PrintJob>('/print-jobs', {
    method: 'POST',
    body: input,
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
