import { saveFile } from './download';

/** Excel export (SheetJS, loaded on demand). Resolves `false` if the viewer declined the save prompt. */
export async function exportXlsx(fileName: string, sheet: string, rows: Record<string, string | number>[], headers: { key: string; label: string }[]): Promise<boolean> {
  const XLSX = await import('xlsx');
  const data = [headers.map((h) => h.label), ...rows.map((r) => headers.map((h) => r[h.key] ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = headers.map((h) => ({ wch: Math.min(48, Math.max(h.label.length, ...rows.map((r) => String(r[h.key] ?? '').length)) + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return saveFile(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
}

export async function readXlsxRows(file: File): Promise<Record<string, string>[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  return XLSX.utils.sheet_to_json<Record<string, string>>(ws, { raw: false, defval: '' });
}
