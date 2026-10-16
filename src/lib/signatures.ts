import type { Agreement, ESigner } from '@/types';
import { formatDateTime } from './dates';

/** A signature already given, in the shape the agreement HTML and the PDF/DOCX exports place it. */
export interface SignatureView {
  role: ESigner['role'];
  name: string;
  kind: 'drawn' | 'typed' | 'dsc';
  /** PNG data URL (drawn or typed signatures). */
  image?: string;
  /** Text appearance for a DSC signature. */
  dscLines?: string[];
  /** One line for under the signature, e.g. "Signed electronically (drawn) · 13 Oct 2026, 17:16". */
  caption: string;
  /** Label for the per-page footer, e.g. "Channel Partner: Pooja Arora". */
  label: string;
}

const ROLE_LABELS: Record<ESigner['role'], string> = { cp: 'Channel Partner', institution: 'Institution' };

/**
 * The signatures to show on the agreement right now: each signer's mark appears as soon as they
 * sign. Nothing is shown for a withdrawn or declined request, or once the agreement went back to
 * Draft or "Ready for signing" (returned by Legal or Admin) and needs signing again.
 */
export function signaturesToShow(a: Pick<Agreement, 'esign' | 'status'>): { signatures: SignatureView[]; everyPage: boolean } | null {
  const req = a.esign;
  if (!req) return null;
  const live = req.status === 'in_progress' || (req.status === 'completed' && a.status !== 'approved_for_signing' && a.status !== 'draft');
  if (!live) return null;
  const signatures = req.signers
    .filter((s) => s.status === 'signed' && s.signature)
    .map((s): SignatureView => {
      const sig = s.signature!;
      const when = formatDateTime(s.signedAt);
      return {
        role: s.role,
        name: s.name,
        kind: sig.kind,
        image: sig.image,
        dscLines: sig.kind === 'dsc' && sig.certificate ? [`Digitally signed by ${s.name}`, `Date: ${when}`, `Serial: ${sig.certificate.serial}`, sig.certificate.issuer] : undefined,
        caption: sig.kind === 'dsc' ? `Digitally signed with DSC · ${when}` : `Signed electronically (${sig.kind}) · ${when}`,
        label: `${ROLE_LABELS[s.role]}: ${s.name}`,
      };
    });
  return signatures.length ? { signatures, everyPage: req.signEveryPage } : null;
}
