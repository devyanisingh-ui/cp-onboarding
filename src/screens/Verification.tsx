'use client';

import { useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Check, FileWarning, ShieldCheck, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import type { DocumentRecord, DocumentType, FieldCheck } from '@/types';
import { kycLabel } from '@/lib/kyc';
import { cpCheck, cpCheckKeys, cpCheckLabel } from '@/lib/cpChecks';
import { api } from '@/services/mockApi';
import { useAction, useApi } from '@/hooks/useApi';
import { useDocumentTitle } from '@/hooks/misc';
import { formatDate, formatDateTime } from '@/lib/dates';
import { formatInr } from '@/lib/format';
import { maskAadhaar } from '@/lib/mask';
import { cn } from '@/lib/cn';
import { correctedDocsToRecheck } from '@/lib/status';
import { Alert, Button, Card, ErrorState, Field, Input, Modal, PageSkeleton, Tabs, Textarea } from '@/components/ui';
import { ActionBar, AgreementHtml, CommentDialog, DocumentFrame, MaskedValue, PageHeader } from '@/components/common';
import { ContactVerificationCard } from '@/components/contactVerification';

/**
 * Checklist review of a signed agreement against its documents.
 *  - gate2: Admin verifies a legacy scan, agreement and CP documents (approve makes it Active).
 *  - legal: Legal reviews the CP's details (lib/cpChecks), each against its document, with the
 *    agreement beside them for reference. Mismatches go back to the BD Executive with a remark on
 *    each; approve makes it Active. When the BD resubmits, Legal re-checks only what it flagged.
 */
type Row = { key: string; label: string; value: ReactNode; doc?: DocumentType };

export function Verification({ mode = 'gate2' }: { mode?: 'gate2' | 'legal' }) {
  const legal = mode === 'legal';
  const { id = '' } = useParams<{ id: string }>();
  const router = useRouter();
  const detail = useApi(() => api.agreements.get(id), [id]);
  const doc = useApi(() => api.agreements.render(id), [id]);
  const [checks, setChecks] = useState<Record<string, FieldCheck>>({});
  const [docTab, setDocTab] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [askingDocs, setAskingDocs] = useState(false);
  const [note, setNote] = useState('');
  const [agreementTab, setAgreementTab] = useState('');
  const cpPaneRef = useRef<HTMLDivElement>(null);
  const agreementPaneRef = useRef<HTMLDivElement>(null);
  // Phones: documents and checklist are tabs instead of a long stacked page.
  const [mobileView, setMobileView] = useState<MobileView>('checks');
  useDocumentTitle(`${legal ? 'Legal review' : 'Gate 2'} ${id}`);
  const remarksOf = (c: string) => {
    const notes = Object.entries(checks).filter(([, v]) => v.remark?.trim()).map(([k, v]) => `${fields.find((f) => f.key === k)?.label ?? k}: ${v.remark!.trim()}`);
    return notes.length ? `${c}\n\nChecklist remarks — ${notes.join('; ')}` : c;
  };
  const approve = useAction(() => (legal ? api.agreements.decideGate1(id, 'approve') : api.agreements.decideGate2(id, 'approve', checks)), {
    success: legal ? 'Approved — agreement is now Active' : 'Verified — agreement is now Active',
    onSuccess: () => router.push(`/agreements/${id}`),
  });
  const askDocs = useAction((items: { key: string; remark: string }[], n: string) => api.agreements.requestCpChanges(id, items, n), {
    success: 'Sent back to the BD Executive to correct the CP details',
    onSuccess: () => router.push('/tasks'),
  });
  const reject = useAction((c: string) => (legal ? api.agreements.decideGate1(id, 'reject', remarksOf(c)) : api.agreements.decideGate2(id, 'reject', checks, c)), { success: 'Returned to the BD Executive', onSuccess: () => router.push('/tasks') });

  const d = detail.data;
  const recheck = legal && d ? correctedDocsToRecheck(d.agreement) : null;
  const fields = useMemo(() => {
    if (!d) return [];
    // Re-review: just the CP details Legal flagged, which the BD has since corrected.
    if (recheck) return allFields(d).filter((f) => recheck.some((it) => it.key === f.key));
    return allFields(d);
  }, [d, recheck]);

  function allFields(d: NonNullable<typeof detail.data>) {
    const a = d.agreement;
    const sp = a.stampPaper;
    const t = d.cp.type;
    const f = d.cp.typeFields;
    const value: Partial<Record<string, ReactNode>> = {
      cp_name: d.cp.legalName,
      contact: [d.cp.contactPerson, d.cp.mobile && `+91 ${d.cp.mobile}`, d.cp.email].filter(Boolean).join(' · ') || '—',
      pan: <MaskedValue masked={d.cp.panMasked} label="PAN" reveal={() => api.cps.reveal(d.cp.id, 'pan')} />,
      owner_pan: f.ownerPan ?? '—',
      aadhaar_masked: maskAadhaar(d.cp.aadhaarLast4),
      cancelled_cheque: <MaskedValue masked={`${d.cp.bank.accountMasked} · ${d.cp.bank.ifsc}`} label="account number" reveal={async () => `${await api.cps.reveal(d.cp.id, 'account')} · ${d.cp.bank.ifsc}`} />,
      gst_certificate: d.cp.gstin ?? '—',
      msme_certificate: f.msmeNumber ?? '—',
      office_address_proof: d.cp.businessAddress || '—',
      shop_establishment: f.shopLicenceNumber ?? '—',
      business_registration: f.businessRegistration ?? '—',
      partnership_deed: `${f.partners ?? '—'} · ${formatDate(f.deedDate)}`,
      incorporation_certificate: `${f.cin ?? '—'} · ${formatDate(f.incorporationDate)}`,
    };
    // The CP's details, each against its KYC document (optional documents only if uploaded).
    const cpRows: Row[] = cpCheckKeys(d.cp, d.cpDocuments.map((x) => x.type)).map((key) => ({ key, label: cpCheckLabel(key, t), value: value[key] ?? '—', doc: cpCheck(key)!.doc }));
    // Legal reviews only the CP's details. Admin's Gate 2 check of a legacy scan also covers the agreement itself.
    if (legal) return cpRows;
    const agreementRows: Row[] = [
      a.esign?.status === 'completed'
        ? { key: 'pages_signed', label: 'E-signatures complete (see the signature certificate page)', value: a.esign.signers.map((s) => `${s.name}: ${s.signature?.kind === 'dsc' ? 'DSC' : s.signature?.kind}`).join(' · ') }
        : { key: 'pages_signed', label: 'Every page signed by both parties', value: 'Check each page' },
      { key: 'cp_name', label: 'CP name in signature block', value: d.cp.legalName },
      { key: 'signatory', label: 'Institution signatory', value: `${a.signatoryName}, ${a.signatoryDesignation}` },
      { key: 'stamp_number', label: a.esign?.status === 'completed' ? 'E-stamp certificate number' : 'Stamp paper number', value: sp?.number ?? '—' },
      { key: 'stamp_value', label: 'Stamp value and state', value: sp ? `${formatInr(sp.valueInr)} · ${sp.state}` : '—' },
      { key: 'stamp_date', label: a.esign?.status === 'completed' ? 'E-stamp issue date' : 'Stamp purchase date', value: formatDate(sp?.purchaseDate) },
      { key: 'dates', label: 'Commencement and expiry', value: `${formatDate(a.startDate)} – ${formatDate(a.endDate)}` },
    ];
    return [...agreementRows, ...cpRows.filter((r) => r.doc)];
  }

  if ((detail.loading && !d) || (doc.loading && !doc.data)) return <PageSkeleton />;
  if (detail.error || doc.error) return <ErrorState error={detail.error ?? doc.error} onRetry={() => (detail.reload(), doc.reload())} />;
  if (legal ? !d!.actions.approveGate1 : !d!.actions.verifyGate2)
    return legal ? (
      <ErrorState title="Not waiting for Legal review" error={new Error('This agreement is not waiting for your Legal review, or it was routed to someone else.')} />
    ) : (
      <ErrorState title="Not ready for Gate 2" error={new Error('This agreement is not waiting for Gate 2 verification, or your role cannot verify it.')} />
    );
  // Newest upload of each type (lists come newest first), so replaced files don't show twice.
  const newest = <T extends { type: string; verificationStatus: string }>(list: T[]) => list.filter((x, i) => x.verificationStatus !== 'mismatch' && list.findIndex((y) => y.type === x.type && y.verificationStatus !== 'mismatch') === i);
  const docs = recheck
    ? newest(d!.cpDocuments).filter((x) => recheck.some((it) => it.documentType === x.type))
    : [...newest(d!.documents.filter((x) => x.type === 'signed_copy' || x.type === 'stamp_paper_scan')), ...(legal ? newest(d!.cpDocuments) : d!.cpDocuments)];
  const current = docs.find((x) => x.id === docTab) ?? docs[0];
  // Legal sees the agreement and the CP's documents in two panes.
  const agreementDocs = newest(d!.documents.filter((x) => x.type === 'signed_copy' || x.type === 'stamp_paper_scan')).sort((a, b) => Number(b.type === 'signed_copy') - Number(a.type === 'signed_copy'));
  const agreementDoc = agreementDocs.find((x) => x.id === agreementTab) ?? agreementDocs[0];
  const cpDocs = recheck ? docs : newest(d!.cpDocuments);
  const cpDoc = cpDocs.find((x) => x.id === docTab) ?? cpDocs[0];
  /** The CP document a checklist row is checked against, if it has one. */
  const docFor = (f: (typeof fields)[number]) => (f.doc ? cpDocs.find((x) => x.type === f.doc) : undefined);
  /** From a checklist row: open its document in the agreement or CP documents pane. */
  const showDoc = (x: DocumentRecord) => {
    const cp = cpDocs.includes(x);
    if (cp) setDocTab(x.id);
    else setAgreementTab(x.id);
    setMobileView(cp ? 'doc' : 'agreement');
    (cp ? cpPaneRef : agreementPaneRef).current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const specimenFor = (x: DocumentRecord) =>
    x.type === 'signed_copy' ? (
      <div className="relative rounded-md bg-white p-6 shadow-card">
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-5xl font-black uppercase tracking-widest text-slate-200/80 [transform:rotate(-24deg)]" aria-hidden>
          Specimen scan
        </span>
        <AgreementHtml html={doc.data!.html} />
      </div>
    ) : undefined;
  const set = (key: string, v: Partial<FieldCheck>) => setChecks((c) => ({ ...c, [key]: { ...(c[key] ?? { status: 'verified' }), ...v } as FieldCheck }));
  const done = fields.filter((f) => checks[f.key]?.status === 'verified').length;
  const mismatched = fields.filter((f) => checks[f.key]?.status === 'mismatch');
  const mismatches = mismatched.length;
  // Legal: any mismatched CP detail goes back to the BD; remarks are collected in the dialog.
  const canSendBack = legal && mismatches > 0;
  /** On a re-review: what the BD did about a flagged item. */
  const fixOf = (key: string) => {
    const it = recheck?.find((x) => x.key === key);
    if (!it) return null;
    return [it.detailsUpdatedAt && 'details corrected', it.replacementId && 'new document uploaded'].filter(Boolean).join(' and ');
  };


  return (
    <div>
      <PageHeader
        title={legal ? 'Legal review' : 'Gate 2 verification'}
        subtitle={`${d!.cp.legalName} · ${d!.institution.shortCode}${d!.agreement.source === 'legacy' ? ' · Legacy import' : ''}${legal && d!.agreement.nonStandard ? ' · Non-standard' : ''}`}
      />
      <div className="mb-4 lg:hidden">
        <Tabs
          label={legal ? 'Legal review sections' : 'Gate 2 sections'}
          active={mobileView}
          onChange={(v) => setMobileView(v as MobileView)}
          tabs={[
            { id: 'checks', label: `Checks ${done}/${fields.length}` },
            ...(legal
              ? [
                  { id: 'agreement', label: 'Agreement' },
                  { id: 'doc', label: 'CP documents', count: cpDocs.length },
                ]
              : [{ id: 'doc', label: 'Documents', count: docs.length }]),
          ]}
        />
      </div>
      {legal && (
        // Legal: the agreement and the CP's documents side by side, so each detail can be checked against both.
        <div className="mb-5 grid gap-5 lg:grid-cols-2">
          <DocPane
            className={cn(mobileView !== 'agreement' && 'max-lg:hidden')}
            title="Agreement"
            label="Agreement documents"
            docs={agreementDocs}
            active={agreementDoc?.id ?? 'text'}
            onChange={setAgreementTab}
            emptyTab="Agreement text"
            labelOf={(x) => kycLabel(d!.cp.type, x.type)}
            paneRef={agreementPaneRef}
          >
            {agreementDoc ? <DocumentFrame key={agreementDoc.id} doc={agreementDoc} specimen={specimenFor(agreementDoc)} /> : <div className="rounded-md bg-white p-6 shadow-card"><AgreementHtml html={doc.data!.html} /></div>}
          </DocPane>
          <DocPane
            className={cn(mobileView !== 'doc' && 'max-lg:hidden')}
            title={recheck ? 'Corrected CP documents' : 'CP documents'}
            label="CP documents"
            docs={cpDocs}
            active={cpDoc?.id ?? ''}
            onChange={setDocTab}
            labelOf={(x) => kycLabel(d!.cp.type, x.type)}
            paneRef={cpPaneRef}
          >
            {cpDoc ? <DocumentFrame key={cpDoc.id} doc={cpDoc} /> : <p className="p-6 text-center text-sm text-muted">The CP hasn’t uploaded any documents.</p>}
          </DocPane>
        </div>
      )}
      <div className={cn('grid gap-5', !legal && 'lg:grid-cols-2')}>
        {!legal && (
          <Card className={cn('min-w-0 overflow-hidden lg:sticky lg:top-[7.5rem] lg:self-start', mobileView !== 'doc' && 'max-lg:hidden')}>
            <div className="px-4 pt-2">
              <Tabs label="Uploaded documents" active={current?.id ?? ''} onChange={setDocTab} tabs={docs.map((x) => ({ id: x.id, label: kycLabel(d!.cp.type, x.type) }))} />
            </div>
            <div className="max-h-[75vh] overflow-y-auto bg-sunken p-3">{current && <DocumentFrame key={current.id} doc={current} specimen={specimenFor(current)} />}</div>
          </Card>
        )}

        <div className="min-w-0 space-y-4">
          <div className={cn('space-y-4', mobileView !== 'checks' && 'max-lg:hidden')}>
          {recheck && (
            <Alert tone="success" title={`What you flagged only (${recheck.length})`}>
              The BD Executive corrected {recheck.length === 1 ? 'the CP detail you flagged' : `the ${recheck.length} CP details you flagged`} and sent {recheck.length === 1 ? 'it' : 'them'} back on {formatDateTime(d!.agreement.docRequest!.closedAt)}
              {d!.agreement.docRequest!.bdNote ? ` with the note “${d!.agreement.docRequest!.bdNote}”` : ''}. Everything else was covered in your earlier review, so only check what changed.
            </Alert>
          )}
          <Alert tone="info">
            {recheck
              ? 'Mark each corrected item. Approve needs each one Verified and makes the agreement Active; if one is still wrong, send it back again.'
              : legal
              ? 'Check each CP detail against its document. Approve needs every item Verified and makes the agreement Active. If a detail doesn’t match, mark it Mismatch, say what’s wrong and send it back: the BD Executive corrects the detail or uploads a corrected document.'
              : 'Mark each item. Approve needs every item Verified; any Mismatch means you reject with comments.'}{' '}
            {done}/{fields.length} verified{mismatches ? `, ${mismatches} mismatch` : ''}.
          </Alert>
          <Card>
            <ul className="divide-y divide-line">
              {fields.map((f) => {
                const c = checks[f.key];
                return (
                  <li key={f.key} className={cn('px-5 py-3.5', c?.status === 'mismatch' && 'bg-danger-50/50')}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-muted">
                          {f.label}
                          {legal && c?.status === 'mismatch' && <span className="ml-1.5 font-medium text-danger-700">· goes back to the BD</span>}
                          {fixOf(f.key) && <span className="ml-1.5 font-medium text-success-700">· BD: {fixOf(f.key)}</span>}
                          {legal && docFor(f) && (
                            <button type="button" className="hit-area ml-2 font-medium text-primary-700 hover:underline" onClick={() => showDoc(docFor(f)!)} aria-label={`View ${kycLabel(d!.cp.type, docFor(f)!.type)} for ${f.label}`}>
                              View
                            </button>
                          )}
                        </p>
                        <p className="mt-0.5 text-sm font-medium text-ink">{f.value}</p>
                      </div>
                      <div className="flex rounded-md border border-line-strong p-0.5" role="group" aria-label={`${f.label} result`}>
                        <button
                          type="button"
                          aria-pressed={c?.status === 'verified'}
                          onClick={() => set(f.key, { status: 'verified' })}
                          className={cn('flex items-center gap-1 rounded px-3 py-2.5 text-xs font-semibold sm:px-2.5 sm:py-1', c?.status === 'verified' ? 'bg-success-600 text-white' : 'text-ink-soft hover:bg-[var(--surface-hover)]')}
                        >
                          <Check className="size-3.5" aria-hidden /> Verified
                        </button>
                        <button
                          type="button"
                          aria-pressed={c?.status === 'mismatch'}
                          onClick={() => set(f.key, { status: 'mismatch' })}
                          className={cn('flex items-center gap-1 rounded px-3 py-2.5 text-xs font-semibold sm:px-2.5 sm:py-1', c?.status === 'mismatch' ? 'bg-danger-600 text-white' : 'text-ink-soft hover:bg-[var(--surface-hover)]')}
                        >
                          <X className="size-3.5" aria-hidden /> Mismatch
                        </button>
                      </div>
                    </div>
                    {c && (
                      <Input className="mt-2 h-9" aria-label={`Remarks for ${f.label}`} placeholder={c.status === 'mismatch' ? 'What doesn’t match?' : 'Remarks (optional)'} value={c.remark ?? ''} onChange={(e) => set(f.key, { remark: e.target.value })} />
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
          {/* Runs alongside this review; for information, it does not block approval. */}
          {legal && <ContactVerificationCard cpId={d!.cp.id} email={d!.cp.email} mobile={d!.cp.mobile} contact={d!.cp.contact} />}
          </div>
          <ActionBar>
            <Button variant="danger" icon={<ThumbsDown className="size-4" />} onClick={() => setRejecting(true)}>
              Reject
            </Button>
            {legal && (
              <Button
                variant="secondary"
                icon={<FileWarning className="size-4" />}
                disabled={!canSendBack}
                title={!canSendBack ? 'Mark a CP detail Mismatch first' : undefined}
                onClick={() => setAskingDocs(true)}
              >
                Send back to BD{mismatches ? ` (${mismatches})` : ''}
              </Button>
            )}
            <Button variant="success" icon={legal ? <ThumbsUp className="size-4" /> : <ShieldCheck className="size-4" />} disabled={done !== fields.length} loading={approve.loading} onClick={() => void approve.run()}>
              Approve — make Active
            </Button>
          </ActionBar>
        </div>
      </div>
      <CommentDialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        title={legal ? 'Reject and return to BD Executive' : 'Reject at Gate 2'}
        description={legal ? 'The agreement goes back to Draft and must be signed again. Your checklist remarks are saved with the comment.' : 'The BD Executive must fix and re-upload. Your field remarks are saved with the comment.'}
        confirmLabel="Reject and return"
        onConfirm={async (c) => (await reject.run(c)).ok}
      />
      {legal && (
        <Modal
          open={askingDocs}
          onClose={() => setAskingDocs(false)}
          title="Send CP details back to the BD"
          description={`The CP (${d!.cp.email}) is emailed these issues, with the BD Executive in copy, and told the BD will get in touch about the corrected documents. No upload link is sent. The BD corrects the details or uploads the corrected documents and sends the agreement back to you; it does not need signing again.`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setAskingDocs(false)}>
                Cancel
              </Button>
              <Button
                loading={askDocs.loading}
                icon={<FileWarning className="size-4" />}
                disabled={mismatched.some((f) => !checks[f.key]?.remark?.trim())}
                onClick={async () => {
                  const items = mismatched.map((f) => ({ key: f.key, remark: checks[f.key]!.remark!.trim() }));
                  if ((await askDocs.run(items, note)).ok) setAskingDocs(false);
                }}
              >
                Send to BD Executive
              </Button>
            </>
          }
        >
          <ul className="space-y-3">
            {mismatched.map((f) => (
              <li key={f.key} className="rounded-lg border border-line p-3">
                <Field label={`${f.label} — what doesn’t match`} required>
                  <Textarea
                    rows={2}
                    value={checks[f.key]?.remark ?? ''}
                    placeholder={f.doc ? 'e.g. The GSTIN entered differs from the certificate, or the scan is blurred.' : 'e.g. The mobile number is wrong.'}
                    onChange={(e) => set(f.key, { remark: e.target.value })}
                  />
                </Field>
              </li>
            ))}
          </ul>
          <Field label="Note for the BD Executive" optional className="mt-4">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </Modal>
      )}
    </div>
  );
}

type MobileView = 'checks' | 'agreement' | 'doc';

/** One document viewer: tabs over its documents and a scrolling frame. */
function DocPane({
  title,
  label,
  docs,
  active,
  onChange,
  labelOf,
  emptyTab,
  paneRef,
  className,
  children,
}: {
  title: string;
  label: string;
  docs: DocumentRecord[];
  active: string;
  onChange: (id: string) => void;
  labelOf: (x: DocumentRecord) => string;
  /** Tab shown when there are no documents (e.g. the agreement text). */
  emptyTab?: string;
  paneRef?: Ref<HTMLDivElement>;
  className?: string;
  children: ReactNode;
}) {
  const tabs = docs.length ? docs.map((x) => ({ id: x.id, label: labelOf(x) })) : emptyTab ? [{ id: active, label: emptyTab }] : [];
  return (
    <section ref={paneRef} aria-label={title} className={cn('min-w-0 scroll-mt-48', className)}>
      <Card className="flex h-full flex-col overflow-hidden">
        <div className="px-4 pt-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {tabs.length > 0 && <Tabs label={label} active={active} onChange={onChange} tabs={tabs} />}
        </div>
        <div className="h-[70vh] overflow-y-auto bg-sunken p-3 max-lg:h-auto max-lg:max-h-[75vh]">{children}</div>
      </Card>
    </section>
  );
}
