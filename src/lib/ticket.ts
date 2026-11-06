/**
 * lib/ticket.ts — Builder de ticket 80mm para impresión directa USB (Fase 1).
 *
 * Genera el contenido de texto ESC/POS que el backend Rust (printer.rs)
 * envolverá con ESC @ / GS V corte y enviará por WinSpool RAW.
 * Ancho fijo 48 columnas (80mm 203dpi). Usa solo ASCII + símbolos básicos
 * para evitar problemas de codepage (ESC t 0x00 CP437 en Rust).
 *
 * Reutiliza el layout del servidor (sales.service.ts buildEscPosTicket):
 *   header sin divisores, folio, fecha es-MX, items, totales, pagos y pie.
 *   El corte lo agrega Rust una línea después del último texto.
 * Fase 1: se arma en frontend tras createSale; Fase 2 reusará el mismo
 * string para print_jobs.content (delegada).
 */

import type { CartItem, TenantSettings } from '../models';

export interface TicketData {
  /** Nombre comercial del ticket (tenant.business_name) */
  businessName: string;
  /** Dirección opcional */
  businessAddress?: string | null;
  /** Teléfono opcional */
  businessPhone?: string | null;
  /** Email opcional */
  businessEmail?: string | null;
  /** RFC opcional */
  businessRfc?: string | null;
  /** Encabezado extra del ticket (tenant.ticket_header) */
  ticketHeader?: string | null;
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
  tax?: number;
  total: number;
  /** Pagos registrados (referenceCode = últimos 4 / folio / referencia) */
  payments: { method: string; amount: number; referenceCode?: string | null }[];
  /** Vuelto en efectivo (payment_change del SaleResponse) */
  change?: number;
  /** Pie de ticket (tenant.receipt_footer) */
  footer?: string | null;
}

/** Datos de encabezado/pie compartidos por el impreso y el PNG/PDF. */
export interface TicketBranding {
  businessName: string;
  businessAddress: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  businessRfc: string | null;
  ticketHeader: string | null;
  footer: string | null;
}

/**
 * Único lugar que decide el branding del ticket: licencia (D1) → tenant.
 * Evita que impresión y descarga muestren datos distintos.
 */
export function resolveTicketBranding(
  tenant: TenantSettings | null | undefined,
  licenseCustomer?: string | null,
): TicketBranding {
  return {
    businessName: licenseCustomer?.trim() || tenant?.business_name || 'PUNTO DE VENTA',
    businessAddress: tenant?.address ?? null,
    businessPhone: tenant?.phone ?? null,
    businessEmail: tenant?.email ?? null,
    businessRfc: tenant?.rfc ?? null,
    ticketHeader: tenant?.ticket_header ?? null,
    footer: tenant?.receipt_footer ?? null,
  };
}

/** Cantidad del ticket ("2", "1.500 kg", "1cja 1.50kg"); igual en papel y PNG/PDF. */
export function formatItemQty(it: CartItem): string {
  if (it.isCaj) {
    return `1cja ${it.weightKg != null ? it.weightKg.toFixed(2) + 'kg' : ''}`.trim();
  }
  return it.weightKg != null ? `${it.weightKg.toFixed(3)} kg` : `${it.quantity}`;
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
    const ref = p.referenceCode?.trim() ? ` ${p.referenceCode}` : '';
    out += `${padRight(label + ref, 28)}${padLeft(money(p.amount), 12)}\n`;
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
 * Normaliza el contenido guardado por el servidor antes de reimprimir.
 *
 * - Quita el cierre viejo (9 líneas en blanco + divisor `====` + tienda).
 * - Centra el encabezado a 48 columnas, igual que la venta normal.
 * - Reemplaza el pie guardado por el pie configurado, con una línea en blanco
 *   antes.
 * - Elimina líneas en blanco sobrantes al final.
 */
export function normalizeReprintTicket(content: string, footer?: string | null): string {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');

  // Busca el divisor de cierre viejo; solo si queda como máximo la tienda debajo.
  let divider = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^={10,}$/.test(lines[i].trim())) {
      divider = i;
      break;
    }
  }
  if (divider !== -1 && lines.slice(divider + 1).filter(l => l.trim() !== '').length <= 1) {
    lines.length = divider;
  }

  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  // El pie guardado por el servidor es genérico; se reemplaza por el configurado.
  if (lines.length > 0) {
    lines.pop();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  // Encabezado: todo lo anterior a FOLIO (nombre, dirección, teléfono).
  const headerEnd = lines.findIndex(l => /^FOLIO:/i.test(l));
  for (let i = 0; i < headerEnd; i++) {
    if (lines[i].trim()) lines[i] = center(lines[i]);
  }

  // Una línea en blanco antes del pie, igual que en la venta normal.
  lines.push('');
  lines.push(center(footer?.trim() || 'GRACIAS POR SU COMPRA'));

  return lines.join('\n');
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
    businessEmail,
    businessRfc,
    ticketHeader,
    folio,
    createdAt,
    cashierName,
    customerName,
    items,
    subtotal,
    discount,
    tax,
    total,
    payments,
    change,
    footer,
  } = data;

  let out = '';

  // Header centrado (sin divisores iniciales: van al cierre para el corte)
  out += center(businessName || 'PUNTO DE VENTA') + '\n';
  if (ticketHeader?.trim()) out += center(ticketHeader) + '\n';
  if (businessAddress?.trim()) out += center(businessAddress) + '\n';
  if (businessPhone?.trim()) out += center(`Tel: ${businessPhone}`) + '\n';
  if (businessEmail?.trim()) out += center(`Email: ${businessEmail}`) + '\n';
  if (businessRfc?.trim()) out += center(`RFC: ${businessRfc}`) + '\n';
  out += `FOLIO: ${folio}\n`;
  out += `FECHA: ${formatDate(createdAt)}\n`;
  if (cashierName?.trim()) out += `CAJERO: ${cashierName}\n`;
  if (customerName?.trim()) out += `CLIENTE: ${customerName}\n`;

  // Tabla items
  out += `${padRight('CANT', COL_QTY)}${padRight('PRODUCTO', 16)}${padLeft('P.UNIT', COL_PRICE)}${padLeft('IMPORTE', COL_SUB)}\n`;
  out += SEP + ' ' + SEP.slice(0, 15) + '\n';

  for (const it of items) {
    const qtyLabel = formatItemQty(it);
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
  if (typeof tax === 'number' && tax > 0.005) {
    out += `${padRight('IMPUESTO', 28)}${padLeft(money(tax), 12)}\n`;
  }
  out += `${padRight('TOTAL', 28)}${padLeft(money(total), 12)}\n`;

  // Pagos
  out += paymentsBlock(payments, total, change);

  // El ticket termina en el pie: una línea en blanco antes, y Rust agrega
  // el corte una línea después.
  out += '\n';
  if (footer?.trim()) {
    out += center(footer) + '\n';
  } else {
    out += center('GRACIAS POR SU COMPRA') + '\n';
  }

  return out;
}
