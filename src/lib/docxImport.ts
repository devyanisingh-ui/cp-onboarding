/**
 * Turns an uploaded Word agreement (.docx) into an editable template body.
 *
 * A .docx is a zip; word/document.xml holds the paragraphs. We read it in the browser (no
 * dependency: the zip directory is parsed by hand and entries inflated with
 * DecompressionStream) and map paragraphs to template blocks:
 *  - Title / Subtitle styles (or a leading bold or centred line) → template title and subtitle
 *  - Headings, numbered or short all-bold lines → clauses, with the following paragraphs as text
 *  - "IN WITNESS WHEREOF …" → the signatures block (signature lines after it are dropped)
 *  - "Annexure …" / "Schedule …" → the Annexure-B block
 *  - Text before the first clause → paragraphs (the preamble)
 * Placeholders such as «CP legal name», [PAN] or {{cp.pan}} become merge fields when they match a
 * field in the catalog; anything else stays as text for the editor to fix.
 */
import type { TemplateBlock, TemplateContent } from '@/types';
import { FIELDS, FIELD_BY_KEY } from './templateFields';

export interface DocxImport {
  content: TemplateContent;
  /** Things the admin should check in the editor. */
  notes: string[];
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// ---------- zip ----------

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read Word files. Use a recent Chrome, Edge, Safari or Firefox.');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reads one entry out of a zip archive. */
async function unzipEntry(buf: ArrayBuffer, name: string): Promise<string | null> {
  const v = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65_557); i--)
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error('This file is not a valid .docx (Word) document.');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const entry = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (entry === name) {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const raw = bytes.subarray(start, start + size);
      if (method === 0) return dec.decode(raw);
      if (method === 8) return dec.decode(await inflateRaw(raw));
      throw new Error('This Word file uses an unsupported compression method.');
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

// ---------- paragraphs ----------

interface Para {
  text: string;
  style: string;
  bold: boolean;
  centred: boolean;
  numbered: boolean;
}

function child(el: Element, name: string): Element | undefined {
  return Array.from(el.children).find((c) => c.namespaceURI === W && c.localName === name);
}

function readParagraphs(xml: string): Para[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  if (!body) throw new Error('No document body found in this Word file.');
  return Array.from(body.getElementsByTagNameNS(W, 'p')).map((p) => {
    const pPr = child(p, 'pPr');
    const style = (pPr && child(pPr, 'pStyle')?.getAttributeNS(W, 'val')) || '';
    const jc = pPr && child(pPr, 'jc')?.getAttributeNS(W, 'val');
    let text = '';
    const runs = Array.from(p.getElementsByTagNameNS(W, 'r'));
    let boldChars = 0;
    for (const r of runs) {
      const rPr = child(r, 'rPr');
      const b = rPr && child(rPr, 'b');
      const isBold = !!b && b.getAttributeNS(W, 'val') !== '0' && b.getAttributeNS(W, 'val') !== 'false';
      for (const c of Array.from(r.children)) {
        const piece = c.localName === 't' ? c.textContent ?? '' : c.localName === 'tab' ? ' ' : c.localName === 'br' ? '\n' : '';
        text += piece;
        if (isBold) boldChars += piece.trim().length;
      }
    }
    text = text.replace(/[ \t ]+/g, ' ').trim();
    return { text, style, bold: text.length > 0 && boldChars >= text.replace(/\s/g, '').length, centred: jc === 'center', numbered: !!(pPr && child(pPr, 'numPr')) };
  });
}

// ---------- merge fields ----------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const LABELS = new Map(FIELDS.map((f) => [norm(f.label), f.key]));
// Common wording in Word templates for the catalog's fields.
const ALIASES: Record<string, string> = {
  'name of the channel partner': 'cp.legal_name',
  'institution legal name': 'institution.legal_name',
  'name of the institution': 'institution.legal_name',
  'channel partner name': 'cp.legal_name',
  'cp name': 'cp.legal_name',
  'name of the individual': 'cp.legal_name',
  'pan number': 'cp.pan',
  'pan no': 'cp.pan',
  'date of agreement': 'agreement.execution_date',
  'date of execution': 'agreement.execution_date',
  'place': 'agreement.execution_place',
  'start date': 'agreement.start_date',
  'end date': 'agreement.end_date',
  'expiry date': 'agreement.end_date',
};

function fieldFor(label: string): string | undefined {
  const raw = label.trim();
  if (FIELD_BY_KEY[raw]) return raw;
  const n = norm(raw);
  return LABELS.get(n) ?? ALIASES[n];
}

/** «Label», [Label], <<Label>> and {{key}} placeholders → {{key}} when the field is known. */
function mapPlaceholders(text: string, found: Set<string>, unknown: Set<string>): string {
  return text.replace(/«([^»]{2,60})»|<<([^>]{2,60})>>|\[([^\]]{2,60})\]|\{\{\s*([^}]{2,60}?)\s*\}\}/g, (all, a, b, c, d) => {
    const label = a ?? b ?? c ?? d;
    const key = fieldFor(label);
    if (key) {
      found.add(key);
      return `{{${key}}}`;
    }
    // Leave unknown square-bracket text alone (often legal cross-references); flag the rest.
    if (c === undefined) unknown.add(label.trim());
    return d !== undefined ? label : all;
  });
}

// ---------- mapping ----------

const NUMBERED = /^(?:(?:clause|article|section)\s+)?(\d+(?:\.\d+)*)[.):]?\s+(.+)$/i;

function isHeading(p: Para): boolean {
  if (/^heading\s?\d|^title$/i.test(p.style)) return true;
  if (p.text.length > 110) return false;
  if (NUMBERED.test(p.text) && (p.bold || p.text.length <= 70) && !/[.;]$/.test(p.text)) return true;
  return p.bold && p.text.length <= 90 && !/[.;,]$/.test(p.text);
}

let idN = 0;
const bid = (k: string) => `imp-${k}-${Date.now().toString(36)}-${(idN++).toString(36)}`;

export async function docxToTemplate(file: Blob, fallbackTitle = 'Channel Partner Agreement'): Promise<DocxImport> {
  const xml = await unzipEntry(await file.arrayBuffer(), 'word/document.xml');
  if (!xml) throw new Error('This file is not a Word document (word/document.xml is missing).');
  const paras = readParagraphs(xml).filter((p) => p.text);
  if (!paras.length) throw new Error('The Word document is empty.');

  const found = new Set<string>();
  const unknown = new Set<string>();
  const map = (t: string) => mapPlaceholders(t, found, unknown);
  let title = '';
  let subtitle: string | undefined;
  const blocks: TemplateBlock[] = [];
  let clause: Extract<TemplateBlock, { kind: 'clause' }> | null = null;
  let annex: Extract<TemplateBlock, { kind: 'annexure' }> | null = null;
  let inSignatures = false;

  for (const [i, p] of paras.entries()) {
    if (/^title$/i.test(p.style) && !title) {
      title = map(p.text);
      continue;
    }
    if (/^subtitle$/i.test(p.style) && !subtitle) {
      subtitle = map(p.text);
      continue;
    }
    // No Title style: a bold or centred first line is the title.
    if (!title && i === 0 && (p.bold || p.centred) && p.text.length <= 120) {
      title = map(p.text);
      continue;
    }
    if (/in witness whereof/i.test(p.text)) {
      clause = null;
      annex = null;
      inSignatures = true;
      if (!blocks.some((b) => b.kind === 'signatures')) blocks.push({ id: bid('sig'), kind: 'signatures' });
      continue;
    }
    if (/^(annexure|annex|schedule)\b/i.test(p.text) && isHeading(p)) {
      clause = null;
      inSignatures = false;
      if (!annex && !blocks.some((b) => b.kind === 'annexure')) {
        annex = { id: bid('annex'), kind: 'annexure', title: map(p.text) };
        blocks.push(annex);
      }
      continue;
    }
    if (annex) {
      // The rate table itself comes from the rate card; keep any explanatory text as the note.
      annex.note = [annex.note, map(p.text)].filter(Boolean).join(' ');
      continue;
    }
    if (inSignatures) continue; // signature lines, names, witnesses
    if (isHeading(p)) {
      const m = NUMBERED.exec(p.text);
      clause = { id: bid('c'), kind: 'clause', title: map(m ? m[2]! : p.text), text: '' };
      blocks.push(clause);
      continue;
    }
    if (clause) clause.text = clause.text ? `${clause.text}\n\n${map(p.text)}` : map(p.text);
    else blocks.push({ id: bid('p'), kind: 'paragraph', text: map(p.text) });
  }

  const notes: string[] = [];
  // Headings with no text under them are section titles, not clauses.
  for (const [i, b] of blocks.entries()) if (b.kind === 'clause' && !b.text.trim()) blocks[i] = { id: b.id, kind: 'heading', text: b.title };
  if (!blocks.some((b) => b.kind === 'clause')) {
    // No headings found: keep the preamble's first paragraph and put the rest in one clause.
    const paras2 = blocks.filter((b): b is Extract<TemplateBlock, { kind: 'paragraph' }> => b.kind === 'paragraph');
    if (paras2.length > 1) {
      const rest = new Set<TemplateBlock>(paras2.slice(1));
      const keep = blocks.filter((b) => !rest.has(b));
      keep.splice(keep.indexOf(paras2[0]!) + 1, 0, { id: bid('c'), kind: 'clause', title: 'Terms and conditions', text: paras2.slice(1).map((r) => r.text).join('\n\n') });
      blocks.splice(0, blocks.length, ...keep);
      notes.push('No clause headings were found, so the body was imported as one clause. Split it into clauses in the editor.');
    }
  }
  if (!blocks.some((b) => b.kind === 'signatures')) {
    const at = blocks.findIndex((b) => b.kind === 'annexure');
    blocks.splice(at < 0 ? blocks.length : at, 0, { id: bid('sig'), kind: 'signatures' });
    notes.push('No “IN WITNESS WHEREOF” line was found; a signatures block was added before the annexure.');
  }
  if (!blocks.some((b) => b.kind === 'annexure')) notes.push('No annexure was found. Add the Annexure-B block if the rate table should print.');
  if (found.size) notes.push(`Merge fields recognised: ${[...found].map((k) => FIELD_BY_KEY[k]!.label).join(', ')}.`);
  else notes.push('No merge fields were recognised. Insert fields (CP name, PAN, dates…) from the palette.');
  if (unknown.size) notes.push(`Placeholders not matched to a field: ${[...unknown].slice(0, 8).join(', ')}. Replace them with fields from the palette.`);

  return { content: { title: title || fallbackTitle, subtitle, blocks }, notes };
}
