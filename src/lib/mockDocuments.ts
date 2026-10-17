/**
 * Demo specimens of the documents the app handles (PAN card, masked Aadhaar, cancelled cheque,
 * GST certificate, e-stamp paper and the signed agreement), drawn as SVG from the record's own
 * data so seeded records have something realistic to show.
 *
 * Every specimen is plainly marked "SPECIMEN — not a valid document": no government emblems,
 * bank logos or security features are reproduced, and ID numbers are always masked.
 *
 * Self-contained (no app imports) so `scripts/make-demo-documents.ts` can reuse it.
 */

export type MockDocType =
  | 'pan'
  | 'owner_pan'
  | 'aadhaar_masked'
  | 'cancelled_cheque'
  | 'gst_certificate'
  | 'msme_certificate'
  | 'office_address_proof'
  | 'shop_establishment'
  | 'business_registration'
  | 'partnership_deed'
  | 'incorporation_certificate'
  | 'stamp_paper_scan'
  | 'signed_copy';

export interface MockDocData {
  cpName: string;
  /** The person on the ID (proprietor, director, individual). */
  personName: string;
  /** Name on the PAN card when it isn't the person's (a company's or firm's PAN). */
  panHolder?: string;
  fatherName?: string;
  dob?: string;
  panMasked: string;
  aadhaarLast4?: string;
  address?: string;
  bank?: { holderName: string; accountMasked: string; ifsc: string; bankName: string; branch: string };
  gstin?: string;
  /** Category-specific details for the registration specimens (numbers already masked where needed). */
  extra?: {
    cpTypeLabel?: string;
    ownerPanMasked?: string;
    msmeNumber?: string;
    shopLicenceNumber?: string;
    businessRegistration?: string;
    partners?: string;
    deedDate?: string;
    cin?: string;
    incorporationDate?: string;
    registeredOffice?: string;
    businessAddress?: string;
  };
  agreement?: {
    id: string;
    institutionName: string;
    institutionAddress?: string;
    signatoryName: string;
    signatoryDesignation: string;
    cpSignerName: string;
    executionPlace?: string;
    startDate?: string;
    endDate?: string;
    signedOn?: string;
    electronic?: boolean;
    stamp?: { number: string; valueInr: number; purchaseDate: string; state: string; vendor: string };
  };
}

export const MOCK_DOC_TYPES: MockDocType[] = [
  'pan',
  'owner_pan',
  'aadhaar_masked',
  'cancelled_cheque',
  'gst_certificate',
  'msme_certificate',
  'office_address_proof',
  'shop_establishment',
  'business_registration',
  'partnership_deed',
  'incorporation_certificate',
  'stamp_paper_scan',
  'signed_copy',
];

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]!);
const FONT = `font-family="Inter, 'Segoe UI', Helvetica, Arial, sans-serif"`;
const MONO = `font-family="'JetBrains Mono', Menlo, Consolas, monospace"`;

function hash(s: string): number {
  return Array.from(s).reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
}

/** A handwriting-like scribble, stable for a given name. */
function signature(name: string, x: number, y: number, w = 190, colour = '#1e3a8a'): string {
  let seed = hash(name) || 1;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const pts: string[] = [`M ${x} ${y}`];
  const steps = 7 + Math.floor(rnd() * 4);
  for (let i = 1; i <= steps; i++) {
    const px = x + (w * i) / steps;
    const py = y + (rnd() - 0.5) * 34;
    const cx = px - w / steps / 2;
    const cy = y + (rnd() - 0.5) * 60;
    pts.push(`Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)}`);
  }
  const flourish = `M ${x + w * 0.1} ${y + 14} C ${x + w * 0.4} ${y + 26}, ${x + w * 0.8} ${y + 4}, ${x + w * 1.02} ${y + 10}`;
  return `<path d="${pts.join(' ')}" fill="none" stroke="${colour}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="${flourish}" fill="none" stroke="${colour}" stroke-width="1.6" stroke-linecap="round"/>`;
}

function watermark(w: number, h: number, size = 0.13): string {
  const fs = Math.round(Math.min(w, h * 1.6) * size);
  return `<g opacity="0.13" pointer-events="none"><text x="${w / 2}" y="${h / 2}" ${FONT} font-size="${fs}" font-weight="900" fill="#b91c1c" text-anchor="middle" dominant-baseline="middle" letter-spacing="${fs / 8}" transform="rotate(-22 ${w / 2} ${h / 2})">SPECIMEN</text></g>`;
}

function footer(w: number, h: number): string {
  return `<text x="${w / 2}" y="${h - 28}" ${FONT} font-size="12" fill="#b91c1c" text-anchor="middle" font-weight="600">Mock document for demo only — not a valid document</text>`;
}

function photo(x: number, y: number, w: number, h: number): string {
  const cx = x + w / 2;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#e2e8f0" stroke="#94a3b8"/>
<circle cx="${cx}" cy="${y + h * 0.38}" r="${w * 0.2}" fill="#94a3b8"/>
<path d="M ${x + w * 0.16} ${y + h * 0.92} Q ${cx} ${y + h * 0.5} ${x + w * 0.84} ${y + h * 0.92} Z" fill="#94a3b8"/>`;
}

function field(x: number, y: number, label: string, value: string, opts: { size?: number; mono?: boolean; w?: number } = {}): string {
  return `<text x="${x}" y="${y}" ${FONT} font-size="12" fill="#64748b" letter-spacing="0.6">${esc(label.toUpperCase())}</text>
<text x="${x}" y="${y + (opts.size ?? 22) + 4}" ${opts.mono ? MONO : FONT} font-size="${opts.size ?? 22}" font-weight="600" fill="#0f172a">${esc(value)}</text>`;
}

function svg(w: number, h: number, body: string, bg = '#ffffff'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${bg}"/>${body}${watermark(w, h)}${footer(w, h)}</svg>`;
}

function pan(d: MockDocData): string {
  const w = 860, h = 540;
  return svg(
    w,
    h,
    `<rect x="12" y="12" width="${w - 24}" height="${h - 24}" rx="22" fill="#f0f9ff" stroke="#7dd3fc" stroke-width="2"/>
<rect x="12" y="12" width="${w - 24}" height="84" rx="22" fill="#0e7490"/><rect x="12" y="70" width="${w - 24}" height="26" fill="#0e7490"/>
<text x="44" y="64" ${FONT} font-size="28" font-weight="800" fill="#fff" letter-spacing="1">PAN CARD</text>
<text x="${w - 44}" y="64" ${FONT} font-size="18" font-weight="600" fill="#cffafe" text-anchor="end">Demo specimen</text>
${photo(44, 132, 150, 186)}
${field(230, 140, 'Name', d.panHolder ?? d.personName, { size: (d.panHolder ?? d.personName).length > 28 ? 18 : 22 })}
${d.fatherName ? field(230, 214, "Father's name", d.fatherName) : field(230, 214, d.panHolder ? 'Signing for the holder' : 'Holder', d.panHolder ? d.personName : d.cpName, { size: 18 })}
${field(230, 288, d.panHolder ? 'Date of incorporation' : 'Date of birth', d.dob ?? '—', { size: 18 })}
${field(44, 370, 'Permanent account number', d.panMasked, { size: 34, mono: true })}
${signature(d.personName, 560, 430, 220)}
<line x1="550" y1="452" x2="800" y2="452" stroke="#94a3b8"/>
<text x="675" y="472" ${FONT} font-size="12" fill="#64748b" text-anchor="middle">Signature</text>`,
  );
}

function aadhaar(d: MockDocData): string {
  const w = 860, h = 540;
  return svg(
    w,
    h,
    `<rect x="12" y="12" width="${w - 24}" height="${h - 24}" rx="22" fill="#fffbeb" stroke="#fcd34d" stroke-width="2"/>
<rect x="12" y="12" width="${w - 24}" height="84" rx="22" fill="#b45309"/><rect x="12" y="70" width="${w - 24}" height="26" fill="#b45309"/>
<text x="44" y="64" ${FONT} font-size="28" font-weight="800" fill="#fff" letter-spacing="1">AADHAAR · MASKED COPY</text>
<text x="${w - 44}" y="64" ${FONT} font-size="18" font-weight="600" fill="#fef3c7" text-anchor="end">Demo specimen</text>
${photo(44, 132, 150, 186)}
${field(230, 140, 'Name', d.personName)}
${field(230, 214, 'Date of birth', d.dob ?? '—', { size: 18 })}
<text x="230" y="288" ${FONT} font-size="12" fill="#64748b" letter-spacing="0.6">ADDRESS</text>
${wrap(d.address ?? '—', 46).map((l, i) => `<text x="230" y="${312 + i * 22}" ${FONT} font-size="17" fill="#0f172a">${esc(l)}</text>`).join('')}
<rect x="44" y="410" width="${w - 88}" height="70" rx="12" fill="#fff" stroke="#fcd34d"/>
<text x="${w / 2}" y="458" ${MONO} font-size="36" font-weight="700" fill="#0f172a" text-anchor="middle" letter-spacing="4">XXXX XXXX ${esc(d.aadhaarLast4 ?? '0000')}</text>`,
  );
}

function cheque(d: MockDocData): string {
  const w = 1000, h = 460;
  const b = d.bank ?? { holderName: d.cpName, accountMasked: '••••0000', ifsc: 'DEMO0000000', bankName: 'Sample Bank', branch: 'Main Branch' };
  const lines = (x1: number, x2: number, y: number) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#94a3b8" stroke-dasharray="2 4"/>`;
  return svg(
    w,
    h,
    `<rect x="10" y="10" width="${w - 20}" height="${h - 20}" rx="10" fill="#eff6ff" stroke="#93c5fd" stroke-width="2"/>
<text x="40" y="58" ${FONT} font-size="26" font-weight="800" fill="#1e3a8a">${esc(b.bankName)}</text>
<text x="40" y="82" ${FONT} font-size="14" fill="#475569">${esc(b.branch)} branch · IFSC ${esc(b.ifsc)} · Specimen cheque</text>
<text x="${w - 40}" y="58" ${FONT} font-size="16" fill="#475569" text-anchor="end">Date  __ __ / __ __ / __ __ __ __</text>
<text x="40" y="140" ${FONT} font-size="16" fill="#475569">Pay</text>${lines(80, w - 260, 142)}
<text x="40" y="190" ${FONT} font-size="16" fill="#475569">Rupees</text>${lines(110, w - 260, 192)}
<rect x="${w - 240}" y="160" width="200" height="44" rx="6" fill="#fff" stroke="#93c5fd"/><text x="${w - 228}" y="189" ${FONT} font-size="18" fill="#475569">₹</text>
<text x="40" y="250" ${FONT} font-size="14" fill="#475569">A/c No.</text>
<text x="110" y="252" ${MONO} font-size="22" font-weight="700" fill="#0f172a" letter-spacing="2">${esc(b.accountMasked)}</text>
<text x="${w - 40}" y="300" ${FONT} font-size="15" font-weight="600" fill="#0f172a" text-anchor="end">For ${esc(b.holderName)}</text>
<text x="${w - 40}" y="350" ${FONT} font-size="13" fill="#475569" text-anchor="end">Authorised signatory</text>
<text x="40" y="${h - 60}" ${MONO} font-size="20" fill="#334155" letter-spacing="6">⑈000000⑈ 000000000⑆ 000000⑈ 31</text>
<g stroke="#b91c1c" stroke-width="5" opacity="0.85"><line x1="300" y1="${h - 40}" x2="560" y2="40"/><line x1="350" y1="${h - 40}" x2="610" y2="40"/></g>
<text x="455" y="${h / 2 + 10}" ${FONT} font-size="44" font-weight="900" fill="#b91c1c" text-anchor="middle" transform="rotate(-58 455 ${h / 2})" letter-spacing="6">CANCELLED</text>`,
    '#ffffff',
  );
}

function gst(d: MockDocData): string {
  const w = 800, h = 1060;
  return page(
    w,
    h,
    'GST registration certificate',
    'Demo specimen',
    `${field(70, 230, 'GSTIN', d.gstin ?? '—', { size: 26, mono: true })}
${field(70, 320, 'Legal name of business', d.cpName)}
${field(70, 400, 'Constitution of business', 'As per CP master', { size: 18 })}
<text x="70" y="480" ${FONT} font-size="12" fill="#64748b" letter-spacing="0.6">ADDRESS OF PRINCIPAL PLACE OF BUSINESS</text>
${wrap(d.address ?? '—', 60).map((l, i) => `<text x="70" y="${506 + i * 24}" ${FONT} font-size="18" fill="#0f172a">${esc(l)}</text>`).join('')}
${field(70, 620, 'Type of registration', 'Regular', { size: 18 })}
${bars(70, 720, w - 140, 6)}`,
  );
}

function stamp(d: MockDocData): string {
  const w = 800, h = 1130;
  const a = d.agreement;
  const s = a?.stamp ?? { number: 'IN-XX00000000', valueInr: 100, purchaseDate: '—', state: '—', vendor: '—' };
  const rows: [string, string][] = [
    ['Certificate no.', s.number],
    ['Certificate issued date', s.purchaseDate],
    ['State', s.state],
    ['Account reference', 'Stamp vendor, retail'],
    ['Description of document', 'Article 5 — Agreement or its records'],
    ['Purpose', `Channel Partner Agreement${a ? ` ${a.id}` : ''}`],
    ['First party', a?.institutionName ?? '—'],
    ['Second party', d.cpName],
    ['Stamp duty paid by', d.cpName],
    ['Stamp duty amount (₹)', `${s.valueInr} (${words(s.valueInr)} only)`],
    ['Issued by', s.vendor],
  ];
  const border = Array.from({ length: 40 }, (_, i) => `<circle cx="${20 + i * 19.5}" cy="20" r="9" fill="none" stroke="#86efac"/><circle cx="${20 + i * 19.5}" cy="${h - 20}" r="9" fill="none" stroke="#86efac"/>`).join('');
  return svg(
    w,
    h,
    `<rect x="0" y="0" width="${w}" height="${h}" fill="#f0fdf4"/>${border}
<rect x="40" y="44" width="${w - 80}" height="${h - 88}" fill="#fff" stroke="#22c55e" stroke-width="2"/>
<text x="${w / 2}" y="104" ${FONT} font-size="30" font-weight="800" fill="#166534" text-anchor="middle" letter-spacing="2">e-STAMP CERTIFICATE</text>
<text x="${w / 2}" y="132" ${FONT} font-size="15" fill="#15803d" text-anchor="middle">Demo specimen · not issued by any authority</text>
<rect x="${w / 2 - 70}" y="152" width="140" height="44" rx="22" fill="#dcfce7" stroke="#22c55e"/>
<text x="${w / 2}" y="181" ${FONT} font-size="20" font-weight="800" fill="#166534" text-anchor="middle">₹ ${esc(s.valueInr)}</text>
${rows.map(([k, v], i) => `<text x="80" y="${250 + i * 46}" ${FONT} font-size="14" fill="#64748b">${esc(k)}</text><text x="330" y="${250 + i * 46}" ${FONT} font-size="16" font-weight="600" fill="#0f172a">${esc(v)}</text><line x1="80" y1="${262 + i * 46}" x2="${w - 80}" y2="${262 + i * 46}" stroke="#e2e8f0"/>`).join('')}
<rect x="80" y="${790}" width="170" height="170" fill="#fff" stroke="#0f172a"/>${qr(80, 790, 170, s.number)}
<text x="280" y="820" ${FONT} font-size="13" fill="#475569">Statutory alert (specimen):</text>
${wrap('The authenticity of a real e-stamp certificate is checked on the issuing authority’s website. This mock has no such record.', 52).map((l, i) => `<text x="280" y="${846 + i * 20}" ${FONT} font-size="13" fill="#475569">${esc(l)}</text>`).join('')}`,
  );
}

function signed(d: MockDocData): string {
  const w = 800, h = 1130;
  const a = d.agreement;
  const sigY = 860;
  return page(
    w,
    h,
    'Channel Partner Agreement',
    a ? `${a.id} · signed copy` : 'Signed copy',
    `<text x="70" y="220" ${FONT} font-size="15" fill="#0f172a">This Agreement is made at ${esc(a?.executionPlace ?? '—')} between</text>
<text x="70" y="248" ${FONT} font-size="16" font-weight="700" fill="#0f172a">${esc(a?.institutionName ?? '—')}</text>
<text x="70" y="272" ${FONT} font-size="14" fill="#475569">(the “Institution”) and</text>
<text x="70" y="300" ${FONT} font-size="16" font-weight="700" fill="#0f172a">${esc(d.cpName)}</text>
<text x="70" y="324" ${FONT} font-size="14" fill="#475569">PAN ${esc(d.panMasked)} (the “Channel Partner”).</text>
<text x="70" y="364" ${FONT} font-size="14" fill="#475569">Term: ${esc(a?.startDate ?? '—')} to ${esc(a?.endDate ?? '—')}</text>
${bars(70, 400, w - 140, 14)}
<text x="70" y="${sigY - 70}" ${FONT} font-size="15" font-weight="700" fill="#0f172a">IN WITNESS WHEREOF the parties have signed this Agreement.</text>
${signature(a?.cpSignerName ?? d.personName, 90, sigY, 200)}
${signature(a?.signatoryName ?? 'Signatory', 470, sigY, 200, '#0f172a')}
<line x1="70" y1="${sigY + 30}" x2="330" y2="${sigY + 30}" stroke="#94a3b8"/><line x1="450" y1="${sigY + 30}" x2="${w - 70}" y2="${sigY + 30}" stroke="#94a3b8"/>
<text x="70" y="${sigY + 54}" ${FONT} font-size="14" font-weight="600" fill="#0f172a">${esc(a?.cpSignerName ?? d.personName)}</text>
<text x="70" y="${sigY + 74}" ${FONT} font-size="13" fill="#475569">For the Channel Partner</text>
<text x="450" y="${sigY + 54}" ${FONT} font-size="14" font-weight="600" fill="#0f172a">${esc(a?.signatoryName ?? '—')}</text>
<text x="450" y="${sigY + 74}" ${FONT} font-size="13" fill="#475569">${esc(a?.signatoryDesignation ?? '')}, for the Institution</text>
<text x="70" y="${sigY + 120}" ${FONT} font-size="13" fill="#475569">${a?.electronic ? 'Signed electronically' : 'Signed on paper'}${a?.signedOn ? ` on ${esc(a.signedOn)}` : ''}${a?.stamp ? ` · Stamp paper ${esc(a.stamp.number)}` : ''}</text>`,
  );
}

/** A registration certificate / record page: title, a list of fields, a seal and a signature. */
function certificate(title: string, subtitle: string, rows: [string, string][], d: MockDocData): string {
  const w = 800, h = 1060;
  return page(
    w,
    h,
    title,
    subtitle,
    `${rows.map(([k, v], i) => `<text x="70" y="${232 + i * 70}" ${FONT} font-size="12" fill="#64748b" letter-spacing="0.6">${esc(k.toUpperCase())}</text>${wrap(v || '—', 58).slice(0, 2).map((l, j) => `<text x="70" y="${258 + i * 70 + j * 22}" ${FONT} font-size="18" font-weight="600" fill="#0f172a">${esc(l)}</text>`).join('')}`).join('')}
<circle cx="${w - 170}" cy="${h - 220}" r="62" fill="none" stroke="#7c3aed" stroke-width="3" stroke-dasharray="4 3" opacity="0.7"/>
<text x="${w - 170}" y="${h - 224}" ${FONT} font-size="13" font-weight="700" fill="#7c3aed" text-anchor="middle" opacity="0.8">SPECIMEN</text>
<text x="${w - 170}" y="${h - 206}" ${FONT} font-size="11" fill="#7c3aed" text-anchor="middle" opacity="0.8">not issued</text>
${signature(d.personName, 70, h - 210, 180)}
<line x1="70" y1="${h - 186}" x2="300" y2="${h - 186}" stroke="#94a3b8"/>
<text x="70" y="${h - 166}" ${FONT} font-size="12" fill="#64748b">Authorised signature</text>`,
  );
}

/** A document page with a header band. */
function page(w: number, h: number, title: string, subtitle: string, body: string): string {
  return svg(
    w,
    h,
    `<rect x="30" y="30" width="${w - 60}" height="${h - 60}" fill="#fff" stroke="#cbd5e1"/>
<text x="70" y="104" ${FONT} font-size="30" font-weight="800" fill="#0f172a">${esc(title)}</text>
<text x="70" y="136" ${FONT} font-size="16" fill="#64748b">${esc(subtitle)}</text>
<line x1="70" y1="160" x2="${w - 70}" y2="160" stroke="#0f172a" stroke-width="2"/>${body}`,
    '#f1f5f9',
  );
}

/** Grey text lines standing in for clauses. */
function bars(x: number, y: number, w: number, n: number): string {
  return Array.from({ length: n }, (_, i) => {
    const len = i % 5 === 4 ? w * 0.55 : w * (0.86 + ((i * 37) % 14) / 100);
    return `<rect x="${x}" y="${y + i * 26}" width="${Math.min(len, w)}" height="9" rx="4" fill="#e2e8f0"/>`;
  }).join('');
}

/** Decorative QR-like block (not a real QR code). */
function qr(x: number, y: number, size: number, text: string): string {
  const n = 21, cell = (size - 20) / n;
  let seed = hash(text) || 1;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const finder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  const cells: string[] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      // Finder squares in three corners: a 7×7 ring with a 3×3 centre.
      const fr = r % 7, fc = c % 7;
      const on = finder(r, c) ? fr === 0 || fr === 6 || fc === 0 || fc === 6 || (fr >= 2 && fr <= 4 && fc >= 2 && fc <= 4) : rnd() > 0.55;
      if (on) cells.push(`<rect x="${(x + 10 + c * cell).toFixed(1)}" y="${(y + 10 + r * cell).toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}"/>`);
    }
  return `<g fill="#0f172a">${cells.join('')}</g>`;
}

function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if ((line + ' ' + word).trim().length > max) {
      out.push(line.trim());
      line = word;
    } else line += ' ' + word;
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

function words(n: number): string {
  const map: Record<number, string> = { 50: 'Fifty', 100: 'One hundred', 200: 'Two hundred', 500: 'Five hundred', 1000: 'One thousand' };
  return map[n] ?? String(n);
}

/** SVG markup for a specimen of this document type. */
export function mockDocumentSvg(type: MockDocType, d: MockDocData): string {
  switch (type) {
    case 'pan':
      return pan(d);
    case 'owner_pan':
      // The owner's / partner's / director's own PAN card.
      return pan({ ...d, panHolder: undefined, fatherName: undefined, panMasked: d.extra?.ownerPanMasked ?? '—' });
    case 'msme_certificate':
      return certificate('Udyam registration certificate', 'MSME · demo specimen', [['Udyam registration number', d.extra?.msmeNumber ?? '—'], ['Name of enterprise', d.cpName], ['Type of organisation', d.extra?.cpTypeLabel ?? '—'], ['Name of owner', d.personName], ['Official address of enterprise', d.extra?.businessAddress ?? d.address ?? '—']], d);
    case 'office_address_proof':
      return certificate('Office address proof', 'Rent agreement / utility bill · demo specimen', [['In the name of', d.cpName], ['Premises address', d.extra?.businessAddress ?? '—'], ['Document', 'Rent agreement (specimen)'], ['Occupant', d.personName]], d);
    case 'shop_establishment':
      return certificate('Shop & Establishment registration', 'Demo specimen', [['Registration number', d.extra?.shopLicenceNumber ?? '—'], ['Name of establishment', d.cpName], ['Name of employer', d.personName], ['Address of establishment', d.extra?.businessAddress ?? '—']], d);
    case 'business_registration':
      return certificate('Business registration', 'Trade licence / registration · demo specimen', [['Registration', d.extra?.businessRegistration ?? '—'], ['Name of business', d.cpName], ['Proprietor', d.personName], ['Business address', d.extra?.businessAddress ?? '—']], d);
    case 'partnership_deed':
      return certificate('Deed of partnership', 'Demo specimen', [['Name of the firm', d.cpName], ['Partners', d.extra?.partners ?? '—'], ['Date of deed', d.extra?.deedDate ?? '—'], ['Principal place of business', d.extra?.businessAddress ?? '—'], ['Authorised partner', d.personName]], d);
    case 'incorporation_certificate':
      return certificate('Certificate of incorporation', 'Demo specimen · not issued by any Registrar', [['Corporate identity number (CIN)', d.extra?.cin ?? '—'], ['Name of the company', d.cpName], ['Date of incorporation', d.extra?.incorporationDate ?? '—'], ['Registered office', d.extra?.registeredOffice ?? '—'], ['PAN of the company', d.panMasked]], d);
    case 'aadhaar_masked':
      return aadhaar(d);
    case 'cancelled_cheque':
      return cheque(d);
    case 'gst_certificate':
      return gst(d);
    case 'stamp_paper_scan':
      return stamp(d);
    case 'signed_copy':
      return signed(d);
  }
}
