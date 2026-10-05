import { DOC_CSS } from './agreementTemplate';

export function downloadBlob(content: BlobPart, fileName: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Prints the merged agreement through a hidden iframe so the browser's "Save as PDF"
 * produces the printable copy. The production build renders PDF server-side (LibreOffice).
 */
export function printAgreement(html: string, title: string) {
  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${DOC_CSS}@page{size:A4;margin:18mm}body{margin:0}.agreement-doc .mf{background:none;border:0}</style></head><body>${html}</body></html>`,
  );
  doc.close();
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 1500);
  }, 150);
}
