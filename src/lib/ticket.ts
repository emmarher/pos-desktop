/**
 * lib/ticket.ts — Builder de ticket 80mm para impresión directa USB (Fase 1).
 *
 * Genera el contenido de texto ESC/POS que el backend Rust (printer.rs)
 * envolverá con ESC @ / GS V corte y enviará por WinSpool RAW.
 * Ancho fijo 48 columnas (80mm 203dpi). Usa solo ASCII + símbolos básicos
 * para evitar problemas de codepage (ESC t 0x00 CP437 en Rust).
 *
 * Reutiliza el layout del servidor (sales.service.ts buildEscPosTicket):
 *   header, folio, fecha es-MX, items, totales, pagos, footer.
 * Fase 1: se arma en frontend tras createSale; Fase 2 reusará el mismo
 * string para print_jobs.content (delegada).
 */

import type { CartItem } from '../models';

export interface TicketData {
  /** Nombre comercial del ticket (tenant.business_name) */
  businessName: string;
  /** Dirección opcional */
  businessAddress?: string | null;
  /** Teléfono opcional */
  businessPhone?: string | null;
  /** Folio V-000001 del SaleResponse */
  folio: string;
  /** Fecha de la venta (ISO). Si no se pasa usa now */
  createdAt?: string;
  /** Cajero (user.name) */
  cashierName?: string | null;
  /** Cliente opcional */
  customerName?: string | null;
  /** Items del carrito en el momento de la venta */
  items: CartItem[];
  /** Totales derivados del carrito */
  subtotal: number;
  discount: number;
  total: number;
  /** Pagos registrados */
  payments: { method: string; amount: number }[];
  /** Vuelto en efectivo (payment_change del SaleResponse) */
  change?: number;
  /** Pie de ticket (tenant.receipt_footer) */
  footer?: string | null;
}

const LINE = '------------------------------------------------'; // 48
const SEP = '--------------------------------'; // 32 para secciones
const COL_QTY = 6;
const COL_PRICE = 10;
const COL_SUB = 12;

function padRight(s: string, n: number): string {
  const t = String(s);
  if (t.length >= n) return t.slice(0, n);
  return t + ' '.repeat(n - t.length);
}
function padLeft(s: string, n: number): string {
  const t = String(s);
  if (t.length >= n) return t.slice(-n);
  return ' '.repeat(n - t.length) + t;
}
function money(n: number): string {
  return `$${n.toFixed(2)}`;
}
function center(s: string, w = 48): string {
  const t = s.trim();
  if (t.length >= w) return t.slice(0, w);
  const l = Math.floor((w - t.length) / 2);
  return ' '.repeat(l) + t;
}
function formatDate(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  try {
    return d.toLocaleString('es-MX', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return d.toISOString();
  }
}

/**
 * Totales y pagos a texto 48 cols.
 */
function paymentsBlock(payments: TicketData['payments'], total: number, change?: number): string {
  if (!payments.length) return '';
  const labels: Record<string, string> = {
    CASH: 'EFECTIVO',
    CARD: 'TARJETA',
    TRANSFER: 'TRANSFERENCIA',
    CREDIT: 'CREDITO',
    VOUCHER: 'VOUCHER',
  };
  let out = '\nPAGOS:\n';
  for (const p of payments) {
    const label = labels[p.method] ?? p.method;
    out += `${padRight(label, 28)}${padLeft(money(p.amount), 12)}\n`;
  }
  if (typeof change === 'number' && change > 0.005) {
    out += `${padRight('VUELTO', 28)}${padLeft(money(change), 12)}\n`;
  } else {
    // calcular vuelto implícito si CASH > total
    const cash = payments.filter(p => p.method === 'CASH').reduce((s, p) => s + p.amount, 0);
    if (cash > total + 0.005) {
      out += `${padRight('VUELTO', 28)}${padLeft(money(cash - total), 12)}\n`;
    }
  }
  return out;
}

/**
 * Construye el cuerpo del ticket 80mm (sin comandos ESC/POS, solo texto).
 * El envoltorio ESC @ + corte lo hace Rust (printer.rs build_print_sequence).
 */
export function buildTicket80mm(data: TicketData): string {
  const {
    businessName,
    businessAddress,
    businessPhone,
    folio,
    createdAt,
    cashierName,
    customerName,
    items,
    subtotal,
    discount,
    total,
    payments,
    change,
    footer,
  } = data;

  let out = '';

  // Header centrado
  out += center(businessName || 'PUNTO DE VENTA') + '\n';
  if (businessAddress) out += center(businessAddress) + '\n';
  if (businessPhone) out += center(`Tel: ${businessPhone}`) + '\n';
  out += LINE + '\n';
  out += `FOLIO: ${folio}\n`;
  out += `FECHA: ${formatDate(createdAt)}\n`;
  if (cashierName) out += `CAJERO: ${cashierName}\n`;
  if (customerName) out += `CLIENTE: ${customerName}\n`;
  out += LINE + '\n';

  // Tabla items
  out += `${padRight('CANT', COL_QTY)}${padRight('PRODUCTO', 16)}${padLeft('P.UNIT', COL_PRICE)}${padLeft('IMPORTE', COL_SUB)}\n`;
  out += SEP + ' ' + SEP.slice(0, 15) + '\n';

  for (const it of items) {
    const qtyLabel = it.isCaj
      ? `1cja ${it.weightKg != null ? it.weightKg.toFixed(2) + 'kg' : ''}`.trim()
      : it.weightKg != null && !it.isCaj
        ? `${it.weightKg.toFixed(3)} kg`
        : `${it.quantity}`;
    const name = it.product.name.slice(0, 16);
    const unit = money(it.unitPrice);
    const sub = money(it.subtotal);
    out += `${padRight(qtyLabel, COL_QTY)}${padRight(name, 16)}${padLeft(unit, COL_PRICE)}${padLeft(sub, COL_SUB)}\n`;
    // Si el nombre es largo, segunda línea con resto
    if (it.product.name.length > 16) {
      out += `       ${it.product.name.slice(16, 48)}\n`;
    }
    if (it.discount > 0.005) {
      out += `       Desc: -${money(it.discount)}\n`;
    }
  }

  out += LINE + '\n';
  out += `${padRight('SUBTOTAL', 28)}${padLeft(money(subtotal), 12)}\n`;
  if (discount > 0.005) {
    out += `${padRight('DESCUENTO', 28)}${padLeft('-' + money(discount), 12)}\n`;
  }
  out += `${padRight('TOTAL', 28)}${padLeft(money(total), 12)}\n`;

  // Pagos
  out += paymentsBlock(payments, total, change);

  out += LINE + '\n';
  if (footer) {
    out += center(footer) + '\n';
  } else {
    out += center('Gracias por su compra') + '\n';
  }
  out += center('Conserve su ticket') + '\n';
  out += '\n\n';

  return out;
}
