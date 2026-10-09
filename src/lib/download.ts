import { DOC_CSS } from './agreementTemplate';

/**
 * The hosted claude.ai viewer never lets a page download through a link; files go through its
 * `downloads` capability, which asks the viewer to confirm. Everywhere else (dev server, PWA, the
 * single-file mobile build) `window.claude` is absent and a normal link download is used.
 */
interface DownloadsCapability {
  save(req: { filename: string; data: Blob }): Promise<{ status: 'saved' | 'delivered' }>;
}
type HostWindow = Window & { claude?: { use?: (name: 'downloads') => Promise<DownloadsCapability | null> } };

let capability: Promise<DownloadsCapability | null> | undefined;

function downloadsCapability(): Promise<DownloadsCapability | null> {
  const use = (window as HostWindow).claude?.use;
  if (!use) return Promise.resolve(null);
  capability ??= use('downloads').catch(() => null);
  return capability;
}

/** True when running inside the hosted viewer, where the print dialog is unavailable. */
export async function isHostedViewer(): Promise<boolean> {
  return (await downloadsCapability()) !== null;
}

/** Saves a file. Resolves `false` if the viewer declined the save prompt. */
export async function saveFile(data: Blob, fileName: string): Promise<boolean> {
  const host = await downloadsCapability();
  if (host) {
    try {
      await host.save({ filename: fileName, data });
      return true;
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'declined') return false;
      if (code === 'rate_limited') throw new Error('A download prompt is already open. Finish that one first.');
      throw new Error('Downloads are not available in this view.');
    }
  }
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/**
 * Prints the merged agreement through a hidden iframe (browser "Save as PDF"). Not available in
 * the hosted viewer; the PDF download covers that case.
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
