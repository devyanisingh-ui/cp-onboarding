/**
 * Builds real DOCX and PDF files from the merged agreement HTML, in the browser.
 * Stands in for the production pipeline (docxtemplater + LibreOffice).
 *
 * The agreement HTML (see renderAgreementHtml) is reduced to a small block model, then written
 * out as WordprocessingML (zipped by hand, no compression) or laid out with pdf-lib.
 */

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  br?: boolean;
}

export type Block =
  | { kind: 'title' | 'subtitle' | 'heading' | 'footer'; runs: Run[] }
  | { kind: 'para'; runs: Run[]; justify?: boolean }
  | { kind: 'signatures'; cols: Run[][][] }
  | { kind: 'table'; header: string[]; rows: string[][]; numericFrom: number };

// ---------------- HTML → blocks ----------------

function runsOf(node: Node, style: { bold?: boolean; italic?: boolean } = {}): Run[] {
  const out: Run[] = [];
  node.childNodes.forEach((c) => {
    if (c.nodeType === Node.TEXT_NODE) {
      const text = (c.textContent ?? '').replace(/\s+/g, ' ');
      if (text) out.push({ text, ...style });
      return;
    }
    if (!(c instanceof Element)) return;
    const tag = c.tagName.toLowerCase();
    if (tag === 'br') out.push({ text: '', br: true });
    else if (c.classList.contains('dev-tag')) out.push({ text: ' (Non-standard)', italic: true });
    else out.push(...runsOf(c, { bold: style.bold || tag === 'strong' || tag === 'b', italic: style.italic || tag === 'em' || tag === 'i' }));
  });
  return out;
}

/** Trims leading/trailing spaces of a paragraph's runs. */
function tidy(runs: Run[]): Run[] {
  const r = runs.map((x) => ({ ...x }));
  while (r.length && !r[0]!.br && !r[0]!.text.trim()) r.shift();
  while (r.length && !r.at(-1)!.br && !r.at(-1)!.text.trim()) r.pop();
  if (r[0] && !r[0].br) r[0].text = r[0].text.trimStart();
  const last = r.at(-1);
  if (last && !last.br) last.text = last.text.trimEnd();
  return r;
}

export function extractBlocks(html: string): Block[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.querySelector('.agreement-doc') ?? doc.body;
  const blocks: Block[] = [];
  const walk = (el: Element) => {
    for (const c of Array.from(el.children)) {
      const tag = c.tagName.toLowerCase();
      if (tag === 'header' || (tag === 'section' && c.classList.contains('annexure'))) walk(c);
      else if (tag === 'h1') blocks.push({ kind: 'title', runs: tidy(runsOf(c)) });
      else if (tag === 'p' && c.classList.contains('sub')) blocks.push({ kind: 'subtitle', runs: tidy(runsOf(c)) });
      else if (/^h[2-6]$/.test(tag)) blocks.push({ kind: 'heading', runs: tidy(runsOf(c)) });
      else if (tag === 'p') blocks.push({ kind: 'para', runs: tidy(runsOf(c)) });
      else if (tag === 'ol' || tag === 'ul') c.querySelectorAll(':scope > li').forEach((li) => blocks.push({ kind: 'para', runs: tidy(runsOf(li)), justify: true }));
      else if (tag === 'footer') blocks.push({ kind: 'footer', runs: tidy(runsOf(c)) });
      else if (tag === 'section' && c.classList.contains('signatures'))
        blocks.push({
          kind: 'signatures',
          cols: Array.from(c.children).map((col) =>
            Array.from(col.children).map((p) => (p.classList.contains('sign-line') ? [{ text: '______________________________' }] : tidy(runsOf(p)))),
          ),
        });
      else if (tag === 'table') {
        const cells = (tr: Element) => Array.from(tr.children).map((td) => (td.textContent ?? '').replace(/\s+/g, ' ').trim());
        const header = c.querySelector('thead tr');
        const head = header ? cells(header) : [];
        const firstNum = header ? Array.from(header.children).findIndex((th) => th.classList.contains('num')) : -1;
        blocks.push({ kind: 'table', header: head, rows: Array.from(c.querySelectorAll('tbody tr')).map(cells), numericFrom: firstNum >= 0 ? firstNum : head.length });
      } else if (c.children.length) walk(c);
    }
  };
  walk(root);
  return blocks.filter((b) => b.kind === 'signatures' || b.kind === 'table' || b.runs.length);
}

// ---------------- DOCX ----------------

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wRuns(runs: Run[], extra = ''): string {
  return runs
    .map((r) => (r.br ? '<w:r><w:br/></w:r>' : `<w:r><w:rPr>${r.bold ? '<w:b/>' : ''}${r.italic ? '<w:i/>' : ''}${extra}</w:rPr><w:t xml:space="preserve">${xml(r.text)}</w:t></w:r>`))
    .join('');
}

function wPara(runs: Run[], opts: { jc?: 'center' | 'both'; after?: number; before?: number; runExtra?: string; keepNext?: boolean } = {}): string {
  const ppr = `<w:pPr>${opts.keepNext ? '<w:keepNext/>' : ''}<w:spacing w:before="${opts.before ?? 0}" w:after="${opts.after ?? 160}"/>${opts.jc ? `<w:jc w:val="${opts.jc}"/>` : ''}</w:pPr>`;
  return `<w:p>${ppr}${wRuns(runs, opts.runExtra)}</w:p>`;
}

function wCell(content: string, width: number, borders: boolean, shade?: string): string {
  const b = borders ? '' : '<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>';
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${b}${shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>` : ''}</w:tcPr>${content}</w:tc>`;
}

const CONTENT_WIDTH = 9866; // A4 minus 18 mm margins, in twentieths of a point

function docxBody(blocks: Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.kind) {
      case 'title':
        out.push(wPara(b.runs, { jc: 'center', after: 60, runExtra: '<w:b/><w:sz w:val="34"/>' }));
        break;
      case 'subtitle':
        out.push(wPara(b.runs, { jc: 'center', after: 320, runExtra: '<w:color w:val="4B5563"/>' }));
        break;
      case 'heading':
        out.push(wPara(b.runs, { before: 240, after: 100, keepNext: true, runExtra: '<w:b/><w:caps/><w:sz w:val="23"/>' }));
        break;
      case 'para':
        out.push(wPara(b.runs, { jc: b.justify ? 'both' : undefined }));
        break;
      case 'footer':
        out.push(wPara(b.runs, { jc: 'center', before: 360, runExtra: '<w:color w:val="6B7280"/><w:sz w:val="16"/>' }));
        break;
      case 'signatures': {
        const w = Math.floor(CONTENT_WIDTH / Math.max(1, b.cols.length));
        const cells = b.cols.map((col) => wCell(col.map((p, i) => wPara(p, { before: i === 1 ? 480 : 0, after: 80 })).join('') || '<w:p/>', w, false)).join('');
        out.push(`<w:tbl><w:tblPr><w:tblW w:w="${CONTENT_WIDTH}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${b.cols.map(() => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid><w:tr>${cells}</w:tr></w:tbl>`);
        out.push(wPara([], { after: 120 }));
        break;
      }
      case 'table': {
        const n = Math.max(b.header.length, ...b.rows.map((r) => r.length));
        const numW = 1100;
        const numCols = Math.max(0, n - b.numericFrom);
        const textW = Math.floor((CONTENT_WIDTH - numW * numCols) / Math.max(1, b.numericFrom));
        const widths = Array.from({ length: n }, (_, i) => (i >= b.numericFrom ? numW : textW));
        const cell = (t: string, i: number, head: boolean) =>
          wCell(wPara([{ text: t }], { jc: i >= b.numericFrom ? 'center' : undefined, after: 0, runExtra: `${head ? '<w:b/>' : ''}<w:sz w:val="18"/>` }), widths[i]!, true, head ? 'F3F4F6' : undefined);
        const rows = [
          ...(b.header.length ? [`<w:tr><w:trPr><w:tblHeader/></w:trPr>${b.header.map((t, i) => cell(t, i, true)).join('')}</w:tr>`] : []),
          ...b.rows.map((r) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((t, i) => cell(t, i, false)).join('')}</w:tr>`),
        ];
        const border = (s: string) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="9CA3AF"/>`;
        out.push(
          `<w:tbl><w:tblPr><w:tblW w:w="${CONTENT_WIDTH}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`,
        );
        out.push(wPara([], { after: 120 }));
        break;
      }
    }
  }
  return out.join('');
}

export function buildDocx(html: string, title: string): Blob {
  const body = docxBody(extractBlocks(html));
  const files: [string, string][] = [
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>',
    ],
    [
      'docProps/core.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(title)}</dc:title><dc:creator>CP Onboarding</dc:creator></cp:coreProperties>`,
    ],
    [
      'word/_rels/document.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    ],
    [
      'word/styles.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia" w:eastAsia="Georgia"/><w:color w:val="111827"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-IN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>',
    ],
    [
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1020" w:right="1020" w:bottom="1020" w:left="1020" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`,
    ],
  ];
  return new Blob([zipStore(files)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

// Minimal ZIP writer (STORE, no compression) — enough for an OOXML package.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipStore(files: [string, string | Uint8Array][]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBytes = enc.encode(name);
    const data = typeof content === 'string' ? enc.encode(content) : content;
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, 0, true); // stored
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

// ---------------- PDF ----------------

export async function buildPdf(html: string, title: string): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator('CP Onboarding');
  const fonts = {
    r: await pdf.embedFont(StandardFonts.TimesRoman),
    b: await pdf.embedFont(StandardFonts.TimesRomanBold),
    i: await pdf.embedFont(StandardFonts.TimesRomanItalic),
    bi: await pdf.embedFont(StandardFonts.TimesRomanBoldItalic),
  };
  type Font = typeof fonts.r;
  const fontFor = (r: { bold?: boolean; italic?: boolean }) => (r.bold && r.italic ? fonts.bi : r.bold ? fonts.b : r.italic ? fonts.i : fonts.r);

  // The standard fonts only cover WinAnsi; map the few characters the agreement uses outside it.
  const encodable = new Map<string, boolean>();
  const safe = (text: string) =>
    Array.from(text.replace(/₹/g, 'Rs. '))
      .map((ch) => {
        if (!encodable.has(ch)) {
          try {
            fonts.r.encodeText(ch);
            encodable.set(ch, true);
          } catch {
            encodable.set(ch, false);
          }
        }
        return encodable.get(ch) ? ch : '?';
      })
      .join('');

  const W = 595.28;
  const H = 841.89;
  const M = 51; // 18 mm
  const ink = rgb(0.07, 0.09, 0.15);
  const grey = rgb(0.42, 0.45, 0.5);
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const ensure = (h: number) => {
    if (y - h < M + 14) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };

  interface Piece { text: string; font: Font; width: number }
  /** Word-wraps runs into lines of pieces that fit `width`. */
  const wrap = (runs: Run[], size: number, width: number, upper = false): Piece[][] => {
    const lines: Piece[][] = [[]];
    let lineW = 0;
    for (const r of runs) {
      if (r.br) {
        lines.push([]);
        lineW = 0;
        continue;
      }
      const font = fontFor(r);
      for (const token of safe(upper ? r.text.toUpperCase() : r.text).split(/(\s+)/)) {
        if (!token) continue;
        const isSpace = /^\s+$/.test(token);
        const text = isSpace ? ' ' : token;
        let w = font.widthOfTextAtSize(text, size);
        if (isSpace && lineW === 0) continue;
        if (!isSpace && lineW + w > width && lineW > 0) {
          const line = lines.at(-1)!;
          while (line.length && /^\s+$/.test(line.at(-1)!.text)) line.pop();
          lines.push([]);
          lineW = 0;
        }
        // A single word wider than the line (long IDs): hard-split it.
        let rest = text;
        while (!isSpace && w > width) {
          let n = rest.length;
          while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n--;
          lines.at(-1)!.push({ text: rest.slice(0, n), font, width: font.widthOfTextAtSize(rest.slice(0, n), size) });
          lines.push([]);
          rest = rest.slice(n);
          w = font.widthOfTextAtSize(rest, size);
          lineW = 0;
        }
        lines.at(-1)!.push({ text: rest, font, width: w });
        lineW += w;
      }
    }
    return lines.filter((l, i) => l.length || i === 0);
  };

  const drawLines = (lines: Piece[][], size: number, x: number, width: number, opts: { align?: 'left' | 'center' | 'justify'; color?: typeof ink; leading?: number } = {}) => {
    const lead = size * (opts.leading ?? 1.45);
    lines.forEach((line, li) => {
      ensure(lead);
      y -= lead;
      const total = line.reduce((s, p) => s + p.width, 0);
      const gaps = line.filter((p) => p.text === ' ').length;
      const justify = opts.align === 'justify' && li < lines.length - 1 && gaps > 0;
      const extra = justify ? (width - total) / gaps : 0;
      let cx = opts.align === 'center' ? x + (width - total) / 2 : x;
      for (const p of line) {
        if (p.text !== ' ') page.drawText(p.text, { x: cx, y, size, font: p.font, color: opts.color ?? ink });
        cx += p.width + (p.text === ' ' ? extra : 0);
      }
    });
  };

  const contentW = W - 2 * M;
  for (const b of extractBlocks(html)) {
    switch (b.kind) {
      case 'title':
        drawLines(wrap(b.runs.map((r) => ({ ...r, bold: true })), 17, contentW), 17, M, contentW, { align: 'center' });
        y -= 2;
        break;
      case 'subtitle':
        drawLines(wrap(b.runs, 10.5, contentW), 10.5, M, contentW, { align: 'center', color: grey });
        y -= 14;
        break;
      case 'heading':
        ensure(40);
        y -= 10;
        drawLines(wrap(b.runs.map((r) => ({ ...r, bold: true })), 11, contentW, true), 11, M, contentW);
        y -= 3;
        break;
      case 'para':
        drawLines(wrap(b.runs, 10.5, contentW), 10.5, M, contentW, { align: b.justify ? 'justify' : 'left' });
        y -= 6;
        break;
      case 'footer':
        y -= 16;
        drawLines(wrap(b.runs, 8, contentW), 8, M, contentW, { align: 'center', color: grey });
        break;
      case 'signatures': {
        const colW = contentW / Math.max(1, b.cols.length);
        const laid = b.cols.map((col) => col.map((p) => wrap(p, 10.5, colW - 16)));
        const height = Math.max(...laid.map((c) => c.reduce((s, ls) => s + ls.length * 10.5 * 1.45 + 6, 0))) + 30;
        ensure(height);
        y -= 10;
        const top = y;
        let bottom = y;
        laid.forEach((col, ci) => {
          y = top;
          col.forEach((lines, pi) => {
            if (pi === 1) y -= 26; // room to sign above the line
            drawLines(lines, 10.5, M + ci * colW, colW - 16);
            y -= 6;
          });
          bottom = Math.min(bottom, y);
        });
        y = bottom - 6;
        break;
      }
      case 'table': {
        const n = Math.max(b.header.length, ...b.rows.map((r) => r.length));
        const numW = 58;
        const textW = (contentW - numW * Math.max(0, n - b.numericFrom)) / Math.max(1, b.numericFrom);
        const widths = Array.from({ length: n }, (_, i) => (i >= b.numericFrom ? numW : textW));
        const size = 9;
        const pad = 4;
        const drawRow = (cells: string[], head: boolean) => {
          const laid = cells.map((t, i) => wrap([{ text: t, bold: head }], size, widths[i]! - 2 * pad));
          const h = Math.max(...laid.map((l) => l.length)) * size * 1.35 + 2 * pad;
          ensure(h);
          let x = M;
          laid.forEach((lines, i) => {
            if (head) page.drawRectangle({ x, y: y - h, width: widths[i]!, height: h, color: rgb(0.953, 0.957, 0.965) });
            page.drawRectangle({ x, y: y - h, width: widths[i]!, height: h, borderColor: rgb(0.61, 0.64, 0.69), borderWidth: 0.5 });
            const saveY = y;
            y -= pad - size * 0.35;
            drawLines(lines, size, x + pad, widths[i]! - 2 * pad, { align: i >= b.numericFrom ? 'center' : 'left', leading: 1.35 });
            y = saveY;
            x += widths[i]!;
          });
          y -= h;
        };
        if (b.header.length) drawRow(b.header, true);
        b.rows.forEach((r) => drawRow(r, false));
        y -= 10;
        break;
      }
    }
  }

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: W - M - fonts.r.widthOfTextAtSize(label, 8), y: M - 22, size: 8, font: fonts.r, color: grey });
  });
  const bytes = await pdf.save();
  return new Blob([bytes], { type: 'application/pdf' });
}
