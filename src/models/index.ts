/**
 * models/index.ts — Modelos de dominio del POS.
 *
 * ────────────────────────────────────────────────────────────────────────
 * Qué contiene este módulo:
 *   Tipos espejo de las entidades del servidor
 *   (esquema_BD_POS_v4_completo.sql). El servidor es la fuente de verdad;
 *   aquí solo reflejamos el contrato de la API para tipar el frontend.
 *
 * Secciones:
 *   1) Identidad y sesión (tenant, usuario, dispositivo, auth)
 *   2) Catálogo (unidades, categorías, precios, descuentos, producto)
 *   3) Clientes y búsquedas
 *   4) Carrito y venta (RF-VE)
 *   5) Post-venta (QoS, impresión, báscula)
 */

/* ── 1) IDENTIDAD Y SESIÓN ──────────────────────────────────────────── */

export interface TenantSettings {
  id: string;
  tenant_id: string;
  business_name: string;
  address?: string | null;
  phone?: string | null;
  receipt_footer?: string | null;
  dark_mode?: boolean;
}

export interface UserInfo {
  id: string;
  tenant_id: string;
  name: string;
  username?: string;
  role_name?: string;
  permissions: string[];
}

export interface DeviceRegistration {
  device_id: string;
  tenant_id: string;
  device_name: string;
  device_type: 'TABLET' | 'PC';
  can_print: boolean;
  can_scale: boolean;
  printer_type?: string;
  printer_protocol?: string;
  printer_address?: string;
  printer_width?: number;
  scale_brand?: string;
  scale_protocol?: string;
  scale_port?: string;
  scale_baud_rate?: number;
}

/** Respuesta de POST /auth/login (JWT 24h + refresh + config) */
export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: UserInfo;
  tenant: TenantSettings;
  device: DeviceRegistration;
  license: {
    status: 'active' | 'expired' | 'grace';
    expires_at: string;
    max_devices: number;
  };
}

/* ── 2) CATÁLOGO ────────────────────────────────────────────────────── */

export type UnitType = 'MASS' | 'COUNT' | 'VOLUME' | 'LENGTH';

export interface MeasurementUnit {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  symbol: string;
  unit_type: UnitType;
  is_fractional: boolean;
  decimal_places: number;
}

export interface Category {
  id: string;
  tenant_id: string;
  name: string;
  prefix: string;
  description?: string | null;
  color?: string | null;
  display_order: number;
  is_active: boolean;
  product_count: number;
}

export interface PriceType {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  is_default: boolean;
  display_order: number;
}

export interface ProductPrice {
  id: string;
  product_id: string;
  price_type_id: string;
  price: number;
  min_quantity: number;
  start_date: string;
  end_date?: string | null;
}

export interface ProductDiscount {
  id: string;
  discount_type_id: string;
  discount_value: number;
  minimum_quantity: number;
  start_date: string;
  end_date?: string | null;
}

export interface Product {
  id: string;
  tenant_id: string;
  category_id?: string | null;
  name: string;
  barcode?: string | null;
  internal_code: string;
  sku?: string | null;
  description?: string | null;
  base_unit_id: string;
  sale_unit_id: string;
  unit_conversion: number;
  /** Precio por defecto (fallback si no hay product_prices) */
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  max_stock: number;
  is_scale_enabled: boolean;
  allow_fractional_sale: boolean;
  is_active: boolean;
  category?: Category | null;
  base_unit?: MeasurementUnit | null;
  sale_unit?: MeasurementUnit | null;
  prices?: ProductPrice[];
  discounts?: ProductDiscount[];
}

/* ── 3) CLIENTES Y BÚSQUEDAS ────────────────────────────────────────── */

export interface ProductSearchResponse {
  items: Product[];
  total: number;
}

export interface Customer {
  id: string;
  tenant_id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  rfc?: string | null;
  credit_limit: number;
  current_balance: number;
  loyalty_points: number;
}

export interface CustomerSearchResponse {
  items: Customer[];
  total: number;
}

/* ── 4) CARRITO Y VENTA (RF-VE) ─────────────────────────────────────── */

/** Ítem del carrito en memoria (RF-VE-001) — nunca se persiste localmente */
export interface CartItem {
  key: string;
  product: Product;
  /** Cantidad vendida (COUNT: entero o decimal si permitido; CAJ: 1) */
  quantity: number;
  /** Peso en kg para productos MASS y modo CAJ (alternate_quantity) */
  weightKg?: number;
  /** Tipo de precio aplicado */
  priceType: PriceType;
  /** Precio unitario efectivo tras descuento */
  unitPrice: number;
  /** Descuento total del ítem */
  discount: number;
  /** Subtotal del ítem */
  subtotal: number;
  /** Conversión a base_unit para descontar stock (RF-VE-003) */
  baseQuantity: number;
  isCaj: boolean;
}

export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'CREDIT' | 'VOUCHER';

export interface SalePayment {
  method: PaymentMethod;
  amount: number;
  /** Tarjeta: últimos 4; Transferencia: folio; Voucher: referencia */
  reference_code?: string;
}

export interface SaleItemPayload {
  product_id: string;
  quantity: number;
  alternate_quantity?: number;
  unit_price: number;
  discount: number;
  subtotal: number;
  base_quantity: number;
  price_type_id: string;
}

export interface CreateSalePayload {
  customer_id?: string;
  items: SaleItemPayload[];
  payments: SalePayment[];
  subtotal: number;
  total_discount: number;
  total: number;
}

export interface SaleResponse {
  id: string;
  tenant_id: string;
  folio: string;
  status: string;
  payment_state: string;
  subtotal: number;
  total_discount: number;
  total: number;
  payment_change?: number;
  created_at: string;
  qos_event_id?: string;
}

/* ── 5) POST-VENTA (QoS, IMPRESIÓN, BÁSCULA) ────────────────────────── */

/** Evento de calidad de servicio (RF-QS) */
export interface ServiceQualityEvent {
  id: string;
  sale_id: string;
  status: 'PENDING' | 'COMPLETED' | 'EXPIRED';
  rating?: number;
  comment?: string;
  expires_at: string;
}

export interface PrintJob {
  id: string;
  source_device_id: string;
  target_device_id: string;
  content: string;
  status: 'PENDING' | 'PRINTING' | 'COMPLETED' | 'FAILED';
  max_retries: number;
  retries: number;
}

/** Peso actual de la báscula (RF-BA-003) */
export interface ScaleReading {
  device_id: string;
  current_scale_weight: number;
  scale_unit: string;
  scale_is_stable: boolean;
  last_heartbeat_at: string;
}
