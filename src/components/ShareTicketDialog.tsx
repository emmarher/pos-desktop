/**
 * components/ShareTicketDialog.tsx — Exporta el ticket a PNG/PDF y lo guarda.
 *
 * Se abre cuando falla la impresión o desde el detalle de una venta.
 */
import {useRef, useState} from 'react';
import {FileImage, FileText, X} from 'lucide-react';
import TicketPreview, {type TicketPreviewData} from './TicketPreview';
import {ticketToPdfBase64, ticketToPngBase64} from '../lib/ticket-export';
import {saveTicketFile, type TicketFileKind} from '../services/ticket-share';
import {toast} from '../hooks/useToast';

interface ShareTicketDialogProps {
  data: TicketPreviewData | null;
  onClose: () => void;
}

export default function ShareTicketDialog({data, onClose}: ShareTicketDialogProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<TicketFileKind | null>(null);

  if (!data) return null;

  const handleExport = async (kind: TicketFileKind) => {
    const el = previewRef.current;
    if (!el) return;
    setBusy(kind);
    try {
      const base64 =
        kind === 'png' ? await ticketToPngBase64(el) : await ticketToPdfBase64(el);
      const safeFolio = (data.folio || 'ticket').replace(/[^\w.-]+/g, '_');
      const saved = await saveTicketFile(kind, base64, `ticket_${safeFolio}`);
      if (saved) toast.success(`Ticket guardado (${kind.toUpperCase()}).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo generar el ticket.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      data-testid="share-ticket-dialog"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col rounded-[var(--radius-xl)] bg-[var(--color-surface-solid)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] p-4">
          <h3 className="text-[var(--font-medium)] font-extrabold text-[var(--color-text)]">
            Compartir ticket
          </h3>
          <button onClick={onClose} aria-label="Cerrar" className="text-[var(--color-text-secondary)]">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-[var(--color-background)] p-4">
          {/* El mismo nodo se muestra y se captura para el export. */}
          <div ref={previewRef} className="mx-auto w-fit bg-white">
            <TicketPreview data={data} />
          </div>
        </div>

        <div className="flex gap-2 border-t border-[var(--color-border)] p-4">
          <button
            className="flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)]/50 px-3 py-2 text-[var(--font-regular)] font-semibold text-[var(--color-on-primary)] disabled:opacity-50"
            onClick={() => void handleExport('png')}
            disabled={busy !== null}
            data-testid="btn-ticket-png"
          >
            <FileImage size={16} />
            {busy === 'png' ? 'Generando…' : 'PNG'}
          </button>
          <button
            className="flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-[var(--font-regular)] font-semibold text-[var(--color-text)] disabled:opacity-50"
            onClick={() => void handleExport('pdf')}
            disabled={busy !== null}
            data-testid="btn-ticket-pdf"
          >
            <FileText size={16} />
            {busy === 'pdf' ? 'Generando…' : 'PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
