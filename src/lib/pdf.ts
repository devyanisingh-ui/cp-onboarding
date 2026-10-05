/** Combines phone photos (or a single PDF) into one PDF, as screen 10 requires. */
export async function combineToPdf(files: File[], name: string): Promise<{ blob: Blob; fileName: string }> {
  if (files.length === 1 && files[0]!.type === 'application/pdf') return { blob: files[0]!, fileName: files[0]!.name };
  if (files.some((f) => f.type === 'application/pdf')) throw new Error('Upload either one PDF, or photos of each page — not both.');
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  for (const f of files) {
    const jpeg = await toJpeg(f);
    const img = await pdf.embedJpg(jpeg);
    const page = pdf.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  const bytes = await pdf.save();
  return { blob: new Blob([bytes], { type: 'application/pdf' }), fileName: `${name}.pdf` };
}

async function toJpeg(file: File): Promise<ArrayBuffer> {
  if (file.type === 'image/jpeg') return file.arrayBuffer();
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not read image'))), 'image/jpeg', 0.85));
  return blob.arrayBuffer();
}
