import type { CpType, TemplateBlock, TemplateContent, TemplateVersion } from '@/types';
import { CP_TYPE_LABELS } from './format';
import { FIELD_BY_KEY, fieldApplies, tokensIn, type FieldDef } from './templateFields';

/** Party paragraph per CP type — the only part of the default text that differs by type. */
const PARTY: Record<CpType, string> = {
  sole_prop:
    'M/s {{cp.legal_name}}, a sole proprietorship firm acting through its proprietor {{cp.proprietor_name}}, residing at {{cp.residence_address}}, having its place of business at {{cp.business_address}}, holding PAN {{cp.pan}} (the “Channel Partner”), of the **Second Part**.',
  pvt_ltd:
    '{{cp.legal_name}}, a company incorporated under the Companies Act, 2013, with CIN {{cp.cin}}, having its registered office at {{cp.registered_office}} and place of business at {{cp.business_address}}, holding PAN {{cp.pan}}, acting through {{cp.authorised_signatory}} under a board resolution dated {{cp.board_resolution_date}} (the “Channel Partner”), of the **Second Part**.',
  partnership:
    'M/s {{cp.legal_name}}, a partnership firm constituted under a deed dated {{cp.deed_date}}, with partners {{cp.partners}}, having its place of business at {{cp.business_address}}, holding PAN {{cp.pan}}, acting through its authorised partner {{cp.authorised_partner}} (the “Channel Partner”), of the **Second Part**.',
  individual:
    '{{cp.legal_name}}, child of {{cp.father_name}}, born on {{cp.dob}}, residing at {{cp.residence_address}}, holding PAN {{cp.pan}} (the “Channel Partner”), of the **Second Part**.',
};

const CLAUSES: Omit<Extract<TemplateBlock, { kind: 'clause' }>, 'kind'>[] = [
  {
    id: 'c1',
    title: 'Appointment',
    text: '{{institution.legal_name}} appoints the Channel Partner, on a non-exclusive basis, to introduce and guide prospective students seeking admission to the programmes offered by {{institution.short_code}}. Nothing in this Agreement creates an employment, agency or partnership relationship.',
    schoolText: '{{institution.legal_name}} appoints the Channel Partner, on a non-exclusive basis, to introduce parents and guardians seeking admission to the classes offered by {{institution.short_code}}. Nothing in this Agreement creates an employment, agency or partnership relationship.',
  },
  { id: 'c2', title: 'Scope of services', text: 'The Channel Partner shall share accurate information about programmes, eligibility and fees as published by the Institution, assist applicants with the application process, and shall not collect any fee or deposit from an applicant on behalf of the Institution.' },
  { id: 'c3', title: 'Obligations of the Channel Partner', text: 'The Channel Partner shall comply with applicable law, the regulations of the relevant statutory bodies and the admission policies of the Institution, and shall not make any promise of admission, scholarship or placement that is not authorised in writing.' },
  {
    id: 'c4',
    title: 'Consideration and payment',
    text: 'For every student admitted through the Channel Partner who has paid the first-year fee in full and has not withdrawn within the refund period, the Institution shall pay the consideration set out in Annexure-B. Payment shall be made within 45 days of the close of the admission cycle against a valid invoice, subject to deduction of tax at source.',
    schoolText: 'For every student admitted through the Channel Partner whose admission and first-term fee has been received, the School shall pay the consideration set out in Annexure-B within 30 days of the close of the admission window, against a valid invoice and subject to tax deduction at source.',
  },
  { id: 'c5', title: 'Term and termination', text: 'This Agreement shall remain in force from the Date of Commencement to the Date of Expiry. Either party may terminate this Agreement for convenience by giving 30 days’ written notice. The Institution may terminate immediately on material breach, misrepresentation or conduct harmful to its reputation.' },
  { id: 'c6', title: 'Use of name and marks', text: 'The Channel Partner shall use the name, logo and marks of {{institution.short_code}} only in material approved in writing by the Institution and shall stop all such use on expiry or termination.' },
  { id: 'c7', title: 'Confidentiality and data protection', text: 'Each party shall keep confidential all non-public information received under this Agreement. Personal data of applicants shall be processed only for the purpose of admission and in accordance with the Digital Personal Data Protection Act, 2023.' },
  { id: 'c8', title: 'Indemnity', text: 'The Channel Partner shall indemnify the Institution against any loss, claim or penalty arising from its breach of this Agreement, negligence or misrepresentation.' },
  { id: 'c9', title: 'Governing law and jurisdiction', text: 'This Agreement is governed by the laws of India. Subject to the arbitration clause, the courts at {{institution.jurisdiction_court}} shall have exclusive jurisdiction.' },
  { id: 'c10', title: 'Arbitration', text: 'Any dispute shall be referred to a sole arbitrator appointed by the Institution under the Arbitration and Conciliation Act, 1996. The seat of arbitration shall be {{institution.arbitration_seat}} and the language English.' },
  { id: 'c11', title: 'Notices', text: 'Notices shall be in writing and delivered by hand, registered post or email to the addresses stated in this Agreement or as updated in writing.' },
  { id: 'c12', title: 'Entire agreement', text: 'This Agreement with its Annexures is the entire agreement between the parties and may be amended only by a written addendum signed by both parties.' },
  { id: 'c13', title: 'Records and retention', text: 'Both parties shall retain records relating to this Agreement for a period of eight years after its expiry or termination.' },
];

/** The built-in template, used by versions created before the editor existed. */
export function defaultTemplateContent(cpType: CpType): TemplateContent {
  return {
    title: 'Channel Partner Agreement',
    subtitle: `(${CP_TYPE_LABELS[cpType]})`,
    blocks: [
      { id: 'p-exec', kind: 'paragraph', text: 'This Channel Partner Agreement is executed on {{agreement.execution_date}} at {{agreement.execution_place}}.' },
      { id: 'h-between', kind: 'heading', text: 'Between' },
      { id: 'p-inst', kind: 'paragraph', text: '**{{institution.legal_name}}**, {{institution.legal_status}}, having its registered address at {{institution.address}} (the “Institution”), acting through its {{institution.signatory_designation}}, of the **First Part**;' },
      { id: 'h-and', kind: 'heading', text: 'And' },
      { id: 'p-party', kind: 'paragraph', text: PARTY[cpType] },
      { id: 'p-term', kind: 'paragraph', text: 'The Institution and the Channel Partner agree as follows. This Agreement commences on {{agreement.start_date}} (the “Date of Commencement”) and expires on {{agreement.end_date}} (the “Date of Expiry”), unless terminated earlier. The Institution’s coordinator for this Agreement is {{institution.coordinator_name}}.' },
      ...CLAUSES.map((c) => ({ ...c, kind: 'clause' as const })),
      { id: 'sig', kind: 'signatures' },
      { id: 'annex', kind: 'annexure', title: 'Annexure-B — Consideration per admitted student', note: 'Slabs are the number of admissions in the admission cycle.' },
    ],
  };
}

export function contentFor(t: Pick<TemplateVersion, 'content' | 'cpType'>): TemplateContent {
  return t.content ?? defaultTemplateContent(t.cpType);
}

export function blockText(b: TemplateBlock): string {
  switch (b.kind) {
    case 'heading':
    case 'paragraph':
      return b.text;
    case 'clause':
      return `${b.title} ${b.text} ${b.schoolText ?? ''}`;
    case 'annexure':
      return `${b.title} ${b.note ?? ''}`;
    default:
      return '';
  }
}

/** Fields referenced by the template, in order of first use. */
export function usedFieldKeys(content: TemplateContent): string[] {
  const seen = new Set<string>();
  for (const b of content.blocks) for (const k of tokensIn(blockText(b))) seen.add(k);
  // The signature block always prints the institution signatory and the CP name.
  if (content.blocks.some((b) => b.kind === 'signatures')) ['institution.signatory_name', 'institution.signatory_designation', 'cp.legal_name'].forEach((k) => seen.add(k));
  return [...seen];
}

export function isRequired(content: TemplateContent, f: FieldDef): boolean {
  return content.required?.[f.key] ?? f.required;
}

export interface ContentIssues {
  errors: string[];
  warnings: string[];
}

/** Editor and server-side checks before a template version can be saved or sent to Legal. */
export function validateContent(content: TemplateContent, cpType: CpType): ContentIssues {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!content.title.trim()) errors.push('Give the template a title.');
  const clauses = content.blocks.filter((b) => b.kind === 'clause');
  if (!clauses.length) errors.push('Add at least one clause.');
  clauses.forEach((c, i) => {
    if (!c.title.trim()) errors.push(`Clause ${i + 1} needs a title.`);
    if (!c.text.trim()) errors.push(`Clause ${i + 1} (${c.title || 'untitled'}) has no text.`);
  });
  content.blocks.forEach((b) => {
    if ((b.kind === 'paragraph' || b.kind === 'heading') && !b.text.trim()) errors.push(`An empty ${b.kind} block — add text or remove it.`);
  });
  const sigs = content.blocks.filter((b) => b.kind === 'signatures').length;
  if (sigs === 0) errors.push('Add the signatures block — both parties must sign.');
  if (sigs > 1) errors.push('Use only one signatures block.');
  const annex = content.blocks.filter((b) => b.kind === 'annexure').length;
  if (annex === 0) warnings.push('No Annexure-B block: the rate table will not be printed.');
  if (annex > 1) errors.push('Use only one Annexure-B block.');
  for (const b of content.blocks) {
    for (const k of tokensIn(blockText(b))) {
      const f = FIELD_BY_KEY[k];
      if (!f) errors.push(`Unknown field {{${k}}}. Pick fields from the palette.`);
      else if (!fieldApplies(f, cpType)) warnings.push(`“${f.label}” doesn’t apply to ${CP_TYPE_LABELS[cpType]} CPs and will print empty.`);
    }
    const stray = blockText(b).replace(/\{\{\s*[a-z_]+\.[a-z_]+\s*\}\}/g, '');
    if (/\{\{|\}\}/.test(stray)) errors.push('A field token is broken — check for stray {{ or }}.');
  }
  for (const k of ['cp.legal_name', 'cp.pan', 'agreement.start_date', 'agreement.end_date']) {
    if (!usedFieldKeys(content).includes(k)) warnings.push(`The template never uses “${FIELD_BY_KEY[k]!.label}”.`);
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

export function newBlockId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
