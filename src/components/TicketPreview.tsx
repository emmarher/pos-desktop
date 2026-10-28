/**
 * components/TicketPreview.tsx — Ticket visual para exportar PNG/PDF.
 *
 * Se renderiza en pantalla y html2canvas lo captura. Estilos inline para
 * que la captura no dependa de variables CSS externas.
 */
import {useResolvedImageUrl} from '../lib/images';

export interface TicketPreviewItem {
  name: string;
  /** Cantidad ya formateada: "2", "1.500 kg", "1 caja × 5.000 kg" */
  qty: string;
  unitPrice: number;
  subtotal: number;
}

export interface TicketPreviewData {
  businessName: string;
  businessAddress?: string | null;
  businessPhone?: string | null;
  logoUrl?: string | null;
  folio: string;
  createdAt: string;
  cashierName?: string | null;
  customerName?: string | null;
  items: TicketPreviewItem[];
  subtotal: number;
  discount: number;
  total: number;
  payments: {method: string; amount: number}[];
  change?: number;
  footer?: string | null;
}

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  CREDIT: 'Crédito',
  VOUCHER: 'Voucher',
};

const money = (n: number) => `$${n.toFixed(2)}`;
const dateText = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('es-MX', {dateStyle: 'short', timeStyle: 'short'});
  } catch {
    return iso;
  }
};

export default function TicketPreview({data}: {data: TicketPreviewData}) {
  const logo = useResolvedImageUrl(data.logoUrl);

  return (
    <div
      style={{
        width: 302,
        backgroundColor: '#ffffff',
        color: '#111111',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 12,
        lineHeight: 1.45,
        padding: 16,
        boxSizing: 'border-box',
      }}
      data-testid="ticket-preview"
    >
      <div style={{textAlign: 'center'}}>
        {logo && (
          <img
            src={logo}
            alt=""
            crossOrigin="anonymous"
            style={{maxHeight: 64, maxWidth: 160, objectFit: 'contain', marginBottom: 6}}
          />
        )}
        <div style={{fontSize: 14, fontWeight: 700, textTransform: 'uppercase'}}>
          {data.businessName}
        </div>
        {data.businessAddress && <div>{data.businessAddress}</div>}
        {data.businessPhone && <div>Tel: {data.businessPhone}</div>}
      </div>

      <div style={{borderTop: '1px dashed #999', margin: '8px 0'}} />

      <div>FOLIO: {data.folio}</div>
      <div>FECHA: {dateText(data.createdAt)}</div>
      {data.cashierName && <div>CAJERO: {data.cashierName}</div>}
      {data.customerName && <div>CLIENTE: {data.customerName}</div>}

      <div style={{borderTop: '1px dashed #999', margin: '8px 0'}} />

      {data.items.map((it, i) => (
        <div key={`${it.name}-${i}`} style={{marginBottom: 4}}>
          <div>{it.name}</div>
          <div style={{display: 'flex', justifyContent: 'space-between'}}>
            <span>
              {it.qty} × {money(it.unitPrice)}
            </span>
            <span>{money(it.subtotal)}</span>
          </div>
        </div>
      ))}

      <div style={{borderTop: '1px dashed #999', margin: '8px 0'}} />

      <div style={{display: 'flex', justifyContent: 'space-between'}}>
        <span>SUBTOTAL</span>
        <span>{money(data.subtotal)}</span>
      </div>
      {data.discount > 0 && (
        <div style={{display: 'flex', justifyContent: 'space-between'}}>
          <span>DESCUENTO</span>
          <span>-{money(data.discount)}</span>
        </div>
      )}
      <div style={{display: 'flex', justifyContent: 'space-between', fontWeight: 700}}>
        <span>TOTAL</span>
        <span>{money(data.total)}</span>
      </div>

      {data.payments.length > 0 && (
        <>
          <div style={{borderTop: '1px dashed #999', margin: '8px 0'}} />
          {data.payments.map((p, i) => (
            <div key={`${p.method}-${i}`} style={{display: 'flex', justifyContent: 'space-between'}}>
              <span>{METHOD_LABELS[p.method] ?? p.method}</span>
              <span>{money(p.amount)}</span>
            </div>
          ))}
        </>
      )}
      {typeof data.change === 'number' && data.change > 0.005 && (
        <div style={{display: 'flex', justifyContent: 'space-between'}}>
          <span>VUELTO</span>
          <span>{money(data.change)}</span>
        </div>
      )}

      <div style={{textAlign: 'center', marginTop: 12}}>{data.footer || 'Gracias por su compra'}</div>
    </div>
  );
}
