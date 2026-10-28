/**
 * lib/ticket-export.ts — Convierte el ticket visual a PNG o PDF (base64).
 */
import html2canvas from 'html2canvas';
import {jsPDF} from 'jspdf';

/** Captura el nodo del ticket como PNG en base64 (sin prefijo data:). */
export async function ticketToPngBase64(el: HTMLElement): Promise<string> {
  const canvas = await html2canvas(el, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
  });
  return canvas.toDataURL('image/png').split(',')[1] ?? '';
}

/** Captura el ticket y lo mete en un PDF de 80 mm de ancho. */
export async function ticketToPdfBase64(el: HTMLElement): Promise<string> {
  const canvas = await html2canvas(el, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
  });
  const image = canvas.toDataURL('image/png');
  const widthMm = 80;
  const heightMm = (canvas.height / canvas.width) * widthMm;
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [widthMm, heightMm],
  });
  pdf.addImage(image, 'PNG', 0, 0, widthMm, heightMm);
  return pdf.output('datauristring').split(',')[1] ?? '';
}
