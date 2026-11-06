/**
 * lib/report-export.ts — Genera el reporte de ventas en PDF (A4, texto real).
 *
 * No usa el servidor para maquetar: recibe las filas ya consultadas por la
 * pantalla de Reportes y solo dibuja. jsPDF ya era dependencia (ticket-export).
 */

import {jsPDF} from 'jspdf';

export interface ReportSaleRow {
  folio: string;
  createdAt: string;
  sellerName: string | null;
  customerName: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  /** Etiqueta ya traducida (Pagado / Pendiente / Parcial…). */
  paymentState: string;
}

export interface ReportProductRow {
  productName: string;
  units: number;
  tickets: number;
  revenue: number;
}

export interface ReportStats {
  todayTotal: number;
  todayTransactions: number;
  averageTicket: number;
  yesterdayTotal: number;
  byPaymentMethod: {label: string; total: number; count: number}[];
  byCategory: {label: string; total: number}[];
}

export interface SalesReportData {
  businessName: string;
  generatedAt: string;
  generatedBy?: string | null;
  /** Rango aplicado, ya legible: "01/10/2026 al 31/10/2026". */
  rangeLabel: string;
  sales: ReportSaleRow[];
  products: ReportProductRow[];
  /** quick-stats del servidor (siempre hoy/ayer, no depende del filtro). */
  stats: ReportStats | null;
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const BOTTOM = 18;
const LINE_H = 4;

const money = (n: number) =>
  `$${n.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

const dateText = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('es-MX', {dateStyle: 'short', timeStyle: 'short'});
};

/** Dibuja el reporte completo y devuelve el PDF en base64 (sin prefijo data:). */
export function buildSalesReportPdf(data: SalesReportData): string {
  const doc = new jsPDF({orientation: 'portrait', unit: 'mm', format: 'a4'});
  let y = MARGIN;

  const setFont = (size: number, style: 'normal' | 'bold' = 'normal') => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(35, 35, 35);
  };

  const addPage = () => {
    doc.addPage();
    y = MARGIN;
  };

  const ensure = (h: number) => {
    if (y + h > PAGE_H - BOTTOM) addPage();
  };

  const paragraph = (text: string, size: number, style: 'normal' | 'bold' = 'normal') => {
    setFont(size, style);
    const lines = doc.splitTextToSize(text, PAGE_W - MARGIN * 2) as string[];
    for (const line of lines) {
      ensure(LINE_H + 1);
      doc.text(line, MARGIN, y);
      y += LINE_H;
    }
  };

  const section = (title: string) => {
    ensure(14);
    y += 4;
    setFont(11, 'bold');
    doc.text(title, MARGIN, y);
    y += 2;
    doc.setDrawColor(185);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 5;
  };

  const drawTable = (
    headers: string[],
    widths: number[],
    rows: string[][],
    rightAlign: boolean[],
  ) => {
    const drawHead = () => {
      setFont(8, 'bold');
      let x = MARGIN;
      headers.forEach((h, i) => {
        doc.text(h, rightAlign[i] ? x + widths[i] - 1 : x + 1, y + 3, {
          align: rightAlign[i] ? 'right' : 'left',
        });
        x += widths[i];
      });
      y += 5;
      doc.setDrawColor(185);
      doc.setLineWidth(0.2);
      doc.line(MARGIN, y - 1.2, PAGE_W - MARGIN, y - 1.2);
      setFont(8);
    };

    ensure(12);
    drawHead();

    if (rows.length === 0) {
      setFont(9);
      doc.text('Sin datos en el periodo.', MARGIN + 1, y + 3);
      y += 8;
      return;
    }

    for (const row of rows) {
      const cells = row.map((c, i) =>
        doc.splitTextToSize(String(c ?? '—'), Math.max(widths[i] - 2, 4)) as string[],
      );
      const lines = Math.max(1, ...cells.map(c => c.length));
      const height = lines * LINE_H + 1.2;
      if (y + height > PAGE_H - BOTTOM) {
        addPage();
        drawHead();
      }
      cells.forEach((cellLines, i) => {
        const align = rightAlign[i] ? 'right' : 'left';
        const x = rightAlign[i] ? MARGIN + widths.slice(0, i + 1).reduce((a, b) => a + b, 0) - 1 : MARGIN + widths.slice(0, i).reduce((a, b) => a + b, 0) + 1;
        cellLines.forEach((line, k) => {
          doc.text(line, x, y + 3 + k * LINE_H, {align});
        });
      });
      y += height;
    }
    y += 3;
  };

  /* ── Encabezado ────────────────────────────────────────────────────── */
  setFont(15, 'bold');
  doc.text(data.businessName.toUpperCase(), MARGIN, y + 2);
  y += 9;
  setFont(12, 'bold');
  doc.text('REPORTE DE VENTAS', MARGIN, y);
  y += 6;
  setFont(9);
  doc.text(`Periodo: ${data.rangeLabel}`, MARGIN, y);
  y += 4.5;
  doc.text(`Generado: ${dateText(data.generatedAt)}`, MARGIN, y);
  y += 4.5;
  if (data.generatedBy?.trim()) {
    doc.text(`Usuario: ${data.generatedBy}`, MARGIN, y);
    y += 4.5;
  }
  y += 1;
  doc.setDrawColor(120);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 3;

  /* ── Resumen del rango (calculado con las filas consultadas) ───────── */
  section('Resumen del periodo');
  const count = data.sales.length;
  const subtotal = data.sales.reduce((s, r) => s + r.subtotal, 0);
  const discount = data.sales.reduce((s, r) => s + r.discount, 0);
  const tax = data.sales.reduce((s, r) => s + r.tax, 0);
  const total = data.sales.reduce((s, r) => s + r.total, 0);
  const average = count > 0 ? total / count : 0;

  const summary: [string, string][] = [
    ['Ventas registradas', String(count)],
    ['Subtotal', money(subtotal)],
    ['Descuentos', `-${money(discount)}`],
    ['Impuestos', money(tax)],
    ['Total', money(total)],
    ['Ticket promedio', money(average)],
  ];
  setFont(9);
  for (const [label, value] of summary) {
    ensure(LINE_H + 1);
    doc.text(label, MARGIN + 1, y);
    doc.text(value, PAGE_W - MARGIN - 1, y, {align: 'right'});
    y += 4.6;
  }
  y += 2;

  /* ── Productos más vendidos ────────────────────────────────────────── */
  section('Productos más vendidos');
  drawTable(
    ['#', 'Producto', 'Unidades', 'Tickets', 'Ingreso'],
    [8, 92, 24, 20, 38],
    data.products.map((p, i) => [
      String(i + 1),
      p.productName,
      p.units.toLocaleString('es-MX', {maximumFractionDigits: 3}),
      String(p.tickets),
      money(p.revenue),
    ]),
    [false, false, true, true, true],
  );

  /* ── Historial completo ────────────────────────────────────────────── */
  section('Historial de ventas');
  drawTable(
    ['Folio', 'Fecha', 'Cajero', 'Cliente', 'Subtotal', 'Desc.', 'Imp.', 'Total', 'Pago'],
    [20, 26, 28, 28, 18, 13, 11, 18, 20],
    data.sales.map(s => [
      s.folio,
      dateText(s.createdAt),
      s.sellerName ?? '—',
      s.customerName ?? '—',
      money(s.subtotal),
      s.discount > 0.005 ? `-${money(s.discount)}` : '—',
      s.tax > 0.005 ? money(s.tax) : '—',
      money(s.total),
      s.paymentState,
    ]),
    [false, false, false, false, true, true, true, true, false],
  );

  /* ── Anexo: quick-stats (siempre hoy, no depende del filtro) ───────── */
  if (data.stats) {
    section('Resumen de hoy (no depende del periodo)');
    setFont(9);
    const today: [string, string][] = [
      ['Ventas de hoy', money(data.stats.todayTotal)],
      ['Transacciones de hoy', String(data.stats.todayTransactions)],
      ['Ticket promedio de hoy', money(data.stats.averageTicket)],
      ['Ventas de ayer', money(data.stats.yesterdayTotal)],
    ];
    for (const [label, value] of today) {
      ensure(LINE_H + 1);
      doc.text(label, MARGIN + 1, y);
      doc.text(value, PAGE_W - MARGIN - 1, y, {align: 'right'});
      y += 4.6;
    }
    y += 3;

    paragraph('Ventas de hoy por método de pago', 9, 'bold');
    drawTable(
      ['Método', 'Operaciones', 'Total'],
      [92, 40, 50],
      data.stats.byPaymentMethod.map(m => [m.label, String(m.count), money(m.total)]),
      [false, true, true],
    );

    paragraph('Ventas de hoy por categoría', 9, 'bold');
    drawTable(
      ['Categoría', 'Total'],
      [132, 50],
      data.stats.byCategory.map(c => [c.label, money(c.total)]),
      [false, true],
    );
  }

  /* ── Pie / numeración ──────────────────────────────────────────────── */
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    setFont(8);
    doc.setTextColor(120, 120, 120);
    doc.text(data.businessName, MARGIN, PAGE_H - 8);
    doc.text(`Página ${i} de ${pages}`, PAGE_W - MARGIN, PAGE_H - 8, {align: 'right'});
  }

  return doc.output('datauristring').split(',')[1] ?? '';
}
