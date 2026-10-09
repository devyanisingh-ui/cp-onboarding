import type { Agreement, CpMaster, CpType, Deviation, Institution, RateCard, RateExtra, RateRow, Slab, TemplateBlock, TemplateVersion } from '@/types';
import { SLABS } from '@/types';
import { formatDate } from './dates';
import { formatInr, CP_TYPE_LABELS } from './format';
import { FIELD_BY_KEY, TOKEN_RE, fieldApplies } from './templateFields';
import { contentFor, isRequired, usedFieldKeys } from './templateContent';

/**
 * Renders an agreement from its template version's content (built in the template editor)
 * with merge fields and Annexure-B filled in (PRD §7). Production would merge the
 * Legal-vetted DOCX with docxtemplater; this renders the same fields to HTML.
 */

export interface MergeContext {
  agreement: Agreement;
  cp: CpMaster;
  institution: Institution;
  rateCard: RateCard;
  template: TemplateVersion;
  deviations: Deviation[];
}

export interface MergeField {
  key: string;
  label: string;
  value: string;
  source: string;
  required: boolean;
}

export interface Clause {
  id: string;
  title: string;
  /** Clause text with institution fields resolved; other fields stay as {{tokens}}. */
  text: (i: Institution) => string;
}

type ClauseBlock = Extract<TemplateBlock, { kind: 'clause' }>;

function clauseText(c: ClauseBlock, i: Institution): string {
  return i.type === 'school' && c.schoolText?.trim() ? c.schoolText : c.text;
}

/** Resolves only institution.* tokens — used where no CP or agreement context exists. */
function resolveInstitutionTokens(text: string, i: Institution): string {
  return text.replace(TOKEN_RE, (m, key: string) => {
    if (!key.startsWith('institution.')) return m;
    const f = FIELD_BY_KEY[key];
    return f ? (f.value({ institution: i, agreement: { signatoryName: i.signatoryName, signatoryDesignation: i.signatoryDesignation, coordinatorName: i.coordinatorName } } as never) ?? m) : m;
  });
}

/** Numbered clauses of a template version — used by the deviation clause picker. */
export function clausesFor(_institution: Institution, template?: Pick<TemplateVersion, 'content' | 'cpType'>): Clause[] {
  const content = contentFor(template ?? { cpType: 'sole_prop' });
  return content.blocks
    .filter((b): b is ClauseBlock => b.kind === 'clause')
    .map((c) => ({ id: c.id, title: c.title, text: (i: Institution) => resolveInstitutionTokens(clauseText(c, i), i) }));
}

// ---------- Rates ----------

export interface EffectiveRates {
  rows: (RateRow & { changed: Partial<Record<Slab, number>> })[];
  extras: (RateExtra & { changedAmount?: number })[];
}

export function effectiveRates(rateCard: RateCard, deviations: Deviation[]): EffectiveRates {
  const approved = deviations.filter((d) => d.type === 'rate' && d.status === 'approved');
  return {
    rows: rateCard.rows.map((row) => {
      const changed: Partial<Record<Slab, number>> = {};
      const slabs = { ...row.slabs };
      for (const slab of SLABS) {
        const dev = approved.find((d) => d.ref === `${row.id}:${slab}`);
        if (dev) {
          const v = Number(dev.agreedValue ?? dev.proposedValue);
          slabs[slab] = v;
          changed[slab] = v;
        }
      }
      return { ...row, slabs, changed };
    }),
    extras: rateCard.extras.map((ex) => {
      const dev = approved.find((d) => d.ref === `extra:${ex.id}`);
      if (!dev) return ex;
      const v = Number(dev.agreedValue ?? dev.proposedValue);
      return { ...ex, amountInr: v, changedAmount: v };
    }),
  };
}

// ---------- Merge fields ----------

const TYPE_FIELDS: Record<CpType, { key: keyof CpMaster['typeFields']; label: string; date?: boolean }[]> = {
  sole_prop: [{ key: 'proprietorName', label: 'Name of the Proprietor' }],
  pvt_ltd: [
    { key: 'cin', label: 'CIN' },
    { key: 'registeredOffice', label: 'Registered office' },
    { key: 'authorisedSignatory', label: 'Director / authorised signatory' },
    { key: 'boardResolutionDate', label: 'Board resolution date', date: true },
  ],
  partnership: [
    { key: 'partners', label: 'Partners' },
    { key: 'deedDate', label: 'Partnership deed date', date: true },
    { key: 'authorisedPartner', label: 'Authorised partner' },
  ],
  individual: [
    { key: 'fatherName', label: "Father's name" },
    { key: 'dob', label: 'Date of birth', date: true },
  ],
};

/** Type-specific CP master fields (for the CP detail screen). */
export function typeFieldDefs(type: CpType) {
  return TYPE_FIELDS[type];
}

/** The fields this agreement's template actually uses, with their merged values. */
export function mergeFields(ctx: MergeContext): MergeField[] {
  const content = contentFor(ctx.template);
  return usedFieldKeys(content)
    .map((k) => FIELD_BY_KEY[k])
    .filter((f): f is NonNullable<typeof f> => !!f)
    .map((f) => ({
      key: f.key,
      label: f.label,
      value: f.value(ctx)?.toString().trim() ?? '',
      source: f.source,
      required: fieldApplies(f, ctx.cp.type) && isRequired(content, f),
    }));
}

export function missingFields(ctx: MergeContext): MergeField[] {
  return mergeFields(ctx).filter((m) => m.required && !m.value);
}

// ---------- HTML ----------

function esc(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Escapes text, then turns **bold**, line breaks and {{field}} tokens into HTML. */
function richText(text: string, field: (key: string) => string): string {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
    .replace(TOKEN_RE, (_m, key: string) => field(key));
}

export function renderAgreementHtml(ctx: MergeContext): string {
  const { agreement: a, cp, institution: i, template } = ctx;
  const content = contentFor(template);
  const fields = Object.fromEntries(mergeFields(ctx).map((m) => [m.key, m]));
  const field = (key: string) => {
    const def = FIELD_BY_KEY[key];
    if (!def) return `<mark class="missing">[Unknown field: ${esc(key)}]</mark>`;
    const m = fields[key];
    const value = m?.value ?? def.value(ctx)?.toString().trim() ?? '';
    return value ? `<span class="mf">${esc(value)}</span>` : `<mark class="missing">[${esc(def.label)}]</mark>`;
  };
  const clauseDevs = ctx.deviations.filter((d) => d.type === 'clause' && d.status === 'approved');
  const rates = effectiveRates(ctx.rateCard, ctx.deviations);
  const learners = i.type === 'university' ? 'Programme' : 'Class';

  const parts: string[] = [];
  let clauseNo = 0;
  let openList = false;
  const closeList = () => {
    if (openList) parts.push('</ol>');
    openList = false;
  };

  for (const b of content.blocks) {
    if (b.kind !== 'clause') closeList();
    switch (b.kind) {
      case 'heading':
        parts.push(`<h2>${richText(b.text, field)}</h2>`);
        break;
      case 'paragraph':
        parts.push(`<p>${richText(b.text, field)}</p>`);
        break;
      case 'clause': {
        if (!openList) parts.push('<ol class="clauses">');
        openList = true;
        clauseNo++;
        const dev = clauseDevs.find((d) => d.ref === b.id);
        const text = dev ? (dev.agreedValue ?? dev.proposedValue) : clauseText(b, i);
        parts.push(`<li><strong>${clauseNo}. ${esc(b.title)}.</strong> ${richText(text, field)}${dev ? ' <span class="dev-tag">Non-standard</span>' : ''}</li>`);
        break;
      }
      case 'signatures':
        parts.push(`<section class="signatures">
    <div>
      <p><strong>For and on behalf of ${esc(i.legalName)}</strong></p>
      <div class="sign-line"></div>
      <p>${field('institution.signatory_name')}<br/>${field('institution.signatory_designation')}</p>
    </div>
    <div>
      <p><strong>For and on behalf of ${field('cp.legal_name')}</strong></p>
      <div class="sign-line"></div>
      <p>${signatoryLine(cp.type, field)}</p>
    </div>
  </section>`);
        break;
      case 'annexure': {
        const rateRows = rates.rows
          .map(
            (r) =>
              `<tr><td>${esc(r.programmeGroup)}</td><td>${esc(r.programmes)}</td>${SLABS.map(
                (s) => `<td class="num${r.changed[s] != null ? ' changed' : ''}">${formatInr(r.slabs[s])}</td>`,
              ).join('')}</tr>`,
          )
          .join('');
        const extras = rates.extras
          .map((e) => `<p class="${e.changedAmount != null ? 'changed' : ''}">${esc(e.label)}: <strong>${formatInr(e.amountInr)}</strong> ${esc(e.unit)}.</p>`)
          .join('');
        parts.push(`<section class="annexure">
    <h2>${richText(b.title, field)}</h2>
    <p class="muted">Rate card version ${ctx.rateCard.version}, effective ${esc(formatDate(ctx.rateCard.effectiveFrom))}.${b.note ? ` ${richText(b.note, field)}` : ''}</p>
    <table>
      <thead><tr><th>${learners} group</th><th>${learners}s</th>${SLABS.map((s) => `<th class="num">${s}</th>`).join('')}</tr></thead>
      <tbody>${rateRows}</tbody>
    </table>
    ${extras}
  </section>`);
        break;
      }
    }
  }
  closeList();

  return `
<article class="agreement-doc">
  <header class="doc-head">
    <h1>${esc(content.title)}</h1>
    ${content.subtitle ? `<p class="sub">${esc(content.subtitle)}</p>` : ''}
  </header>
  ${parts.join('\n  ')}
  <footer class="doc-foot">Agreement ${esc(a.id)} · v${a.version} · Template ${esc(CP_TYPE_LABELS[template.cpType])} v${template.version}</footer>
</article>`;
}

function signatoryLine(type: CpType, field: (k: string) => string): string {
  switch (type) {
    case 'sole_prop':
      return `${field('cp.proprietor_name')}<br/>Proprietor`;
    case 'pvt_ltd':
      return `${field('cp.authorised_signatory')}<br/>Authorised Signatory`;
    case 'partnership':
      return `${field('cp.authorised_partner')}<br/>Authorised Partner`;
    case 'individual':
      return field('cp.legal_name');
  }
}

export const DOC_CSS = `
.agreement-doc{font-family:Georgia,'Times New Roman',serif;color:#111827;line-height:1.6;font-size:14px;overflow-wrap:anywhere}
.agreement-doc h1{font-size:22px;text-align:center;margin:0;letter-spacing:.02em}
.agreement-doc .sub{text-align:center;margin:4px 0 20px;color:#4b5563}
.agreement-doc h2{font-size:15px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.04em}
.agreement-doc p{margin:0 0 10px}
.agreement-doc .clauses{padding-left:0;list-style:none}
.agreement-doc .clauses li{margin-bottom:10px;text-align:justify}
.agreement-doc .mf{background:#eff8fb;border-bottom:1px dotted #0b6480;padding:0 2px}
.agreement-doc mark.missing{background:#fef3c7;color:#92400e;border:1px dashed #d97706;padding:0 4px;border-radius:3px;font-family:system-ui,sans-serif;font-size:12px}
.agreement-doc .dev-tag{font-family:system-ui,sans-serif;font-size:11px;background:#ffedd5;color:#9a3412;padding:1px 6px;border-radius:999px}
.agreement-doc .signatures{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:28px}
.agreement-doc .sign-line{border-bottom:1px solid #111827;height:48px;margin:8px 0}
.agreement-doc .annexure{margin-top:32px;border-top:2px solid #111827;padding-top:12px;overflow-x:auto}
.agreement-doc table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0 12px}
.agreement-doc th,.agreement-doc td{border:1px solid #9ca3af;padding:6px 8px;text-align:left;vertical-align:top}
.agreement-doc th{background:#f3f4f6}
.agreement-doc .num{text-align:right;white-space:nowrap}
.agreement-doc .changed{background:#ffedd5;font-weight:600}
.agreement-doc .muted{color:#6b7280;font-size:12px}
.agreement-doc .doc-foot{margin-top:28px;border-top:1px solid #d1d5db;padding-top:8px;font-family:system-ui,sans-serif;font-size:11px;color:#6b7280;text-align:center}
@media (max-width:560px){.agreement-doc .signatures{grid-template-columns:1fr}.agreement-doc{font-size:13px}}
`;
