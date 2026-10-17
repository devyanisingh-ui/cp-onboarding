import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, FileWarning, ShieldCheck, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import type { DocumentType, FieldCheck } from '@/types';
import { api } from '@/services/mockApi';
import { useAction, useApi } from '@/hooks/useApi';
import { useDocumentTitle } from '@/hooks/misc';
import { formatDate } from '@/lib/dates';
import { formatInr } from '@/lib/format';
import { maskAadhaar } from '@/lib/mask';
import { cn } from '@/lib/cn';
import { Alert, Button, Card, ErrorState, Field, Input, Modal, PageSkeleton, Tabs, Textarea } from '@/components/ui';
import { ActionBar, AgreementHtml, CommentDialog, DocumentFrame, MaskedValue, PageHeader, docLabel } from '@/components/common';

/**
 * Checklist review of a signed agreement against its documents.
 *  - gate2: Admin verifies a legacy scan (approve makes it Active).
 *  - legal: Legal reviews a signed agreement. A Mismatch on a CP document (PAN, Aadhaar, cheque,
 *    GST) can be sent back for the CP to correct; approve sends it to Admin for final approval.
 */
export function Verification({ mode = 'gate2' }: { mode?: 'gate2' | 'legal' }) {
  const legal = mode === 'legal';
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const detail = useApi(() => api.agreements.get(id), [id]);
  const doc = useApi(() => api.agreements.render(id), [id]);
  const [checks, setChecks] = useState<Record<string, FieldCheck>>({});
  const [docTab, setDocTab] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [askingDocs, setAskingDocs] = useState(false);
  const [note, setNote] = useState('');
  // Phones: document and checklist are tabs instead of a long stacked page.
  const [mobileView, setMobileView] = useState<'checks' | 'doc'>('checks');
  useDocumentTitle(`${legal ? 'Legal review' : 'Gate 2'} ${id}`);
  const remarksOf = (c: string) => {
    const notes = Object.entries(checks).filter(([, v]) => v.remark?.trim()).map(([k, v]) => `${fields.find((f) => f.key === k)?.label ?? k}: ${v.remark!.trim()}`);
    return notes.length ? `${c}\n\nChecklist remarks — ${notes.join('; ')}` : c;
  };
  const approve = useAction(() => (legal ? api.agreements.decideGate1(id, 'approve') : api.agreements.decideGate2(id, 'approve', checks)), {
    success: legal ? 'Approved — sent to Admin for final approval' : 'Verified — agreement is now Active',
    onSuccess: () => navigate(`/agreements/${id}`),
  });
  const askDocs = useAction((items: { documentId: string; remark: string }[], n: string) => api.agreements.requestDocChanges(id, items, n), {
    success: 'Sent back to the BD Executive to get corrected documents from the CP',
    onSuccess: () => navigate('/tasks'),
  });
  const reject = useAction((c: string) => (legal ? api.agreements.decideGate1(id, 'reject', remarksOf(c)) : api.agreements.decideGate2(id, 'reject', checks, c)), { success: 'Returned to the BD Executive', onSuccess: () => navigate('/tasks') });

  const d = detail.data;
  const fields = useMemo(() => {
    if (!d) return [];
    const a = d.agreement;
    const sp = a.stampPaper;
    const rows: { key: string; label: string; value: ReactNode; doc?: DocumentType }[] = [
      a.esign?.status === 'completed'
        ? { key: 'pages_signed', label: 'E-signatures complete (see the signature certificate page)', value: a.esign.signers.map((s) => `${s.name}: ${s.signature?.kind === 'dsc' ? 'DSC' : s.signature?.kind}`).join(' · ') }
        : { key: 'pages_signed', label: 'Every page signed by both parties', value: 'Check each page' },
      { key: 'cp_name', label: 'CP name in signature block', value: d.cp.legalName },
      { key: 'signatory', label: 'Institution signatory', value: `${a.signatoryName}, ${a.signatoryDesignation}` },
      { key: 'stamp_number', label: a.esign?.status === 'completed' ? 'E-stamp certificate number' : 'Stamp paper number', value: sp?.number ?? '—' },
      { key: 'stamp_value', label: 'Stamp value and state', value: sp ? `${formatInr(sp.valueInr)} · ${sp.state}` : '—' },
      { key: 'stamp_date', label: a.esign?.status === 'completed' ? 'E-stamp issue date' : 'Stamp purchase date', value: formatDate(sp?.purchaseDate) },
      { key: 'dates', label: 'Commencement and expiry', value: `${formatDate(a.startDate)} – ${formatDate(a.endDate)}` },
      { key: 'pan', label: 'PAN matches PAN copy', value: <MaskedValue masked={d.cp.panMasked} label="PAN" reveal={() => api.cps.reveal(d.cp.id, 'pan')} />, doc: 'pan' },
      { key: 'aadhaar', label: 'Aadhaar copy is masked; last 4 match', value: maskAadhaar(d.cp.aadhaarLast4), doc: 'aadhaar_masked' },
      { key: 'bank', label: 'Bank details match cancelled cheque', value: <MaskedValue masked={`${d.cp.bank.accountMasked} · ${d.cp.bank.ifsc}`} label="account number" reveal={async () => `${await api.cps.reveal(d.cp.id, 'account')} · ${d.cp.bank.ifsc}`} />, doc: 'cancelled_cheque' },
    ];
    if (d.cp.gstRegistered) rows.push({ key: 'gst', label: 'GSTIN matches GST certificate', value: d.cp.gstin ?? '—', doc: 'gst_certificate' });
    return rows;
  }, [d]);

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
  const docs = [...newest(d!.documents.filter((x) => x.type === 'signed_copy' || x.type === 'stamp_paper_scan')), ...(legal ? newest(d!.cpDocuments) : d!.cpDocuments)];
  const current = docs.find((x) => x.id === docTab) ?? docs[0];
  const set = (key: string, v: Partial<FieldCheck>) => setChecks((c) => ({ ...c, [key]: { ...(c[key] ?? { status: 'verified' }), ...v } as FieldCheck }));
  const done = fields.filter((f) => checks[f.key]?.status === 'verified').length;
  const mismatched = fields.filter((f) => checks[f.key]?.status === 'mismatch');
  const mismatches = mismatched.length;
  // Legal: document mismatches can go back to the CP; anything else in the agreement means Reject.
  const docMismatches = mismatched.filter((f) => f.doc && d!.cpDocuments.some((x) => x.type === f.doc));
  // Enabled as soon as any CP document is marked Mismatch; remarks are collected in the dialog.
  const canAskDocs = legal && docMismatches.length > 0;
  const otherMismatches = mismatched.filter((f) => !docMismatches.includes(f));


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
          onChange={setMobileView}
          tabs={[
            { id: 'checks', label: `Checks ${done}/${fields.length}` },
            { id: 'doc', label: 'Documents', count: docs.length },
          ]}
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className={cn('min-w-0 overflow-hidden lg:sticky lg:top-[7.5rem] lg:self-start', mobileView !== 'doc' && 'max-lg:hidden')}>
          <div className="px-4 pt-2">
            <Tabs label="Uploaded documents" active={current?.id ?? ''} onChange={setDocTab} tabs={docs.map((x) => ({ id: x.id, label: docLabel(x.type) }))} />
          </div>
          <div className="max-h-[75vh] overflow-y-auto bg-sunken p-3">
            {current && (
              <DocumentFrame
                key={current.id}
                doc={current}
                specimen={
                  current.type === 'signed_copy' ? (
                    <div className="relative rounded-md bg-white p-6 shadow-card">
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-5xl font-black uppercase tracking-widest text-slate-200/80 [transform:rotate(-24deg)]" aria-hidden>
                        Specimen scan
                      </span>
                      <AgreementHtml html={doc.data!.html} />
                    </div>
                  ) : undefined
                }
              />
            )}
          </div>
        </Card>

        <div className="min-w-0 space-y-4">
          <div className={cn('space-y-4', mobileView !== 'checks' && 'max-lg:hidden')}>
          <Alert tone="info">
            {legal
              ? 'Mark each item against the documents. Approve needs every item Verified and sends the agreement to Admin. If only CP documents (PAN, Aadhaar, cheque, GST) don’t match, request document changes and the CP re-uploads them; any other mismatch means you reject with comments.'
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
                          {legal && f.doc && c?.status === 'mismatch' && <span className="ml-1.5 font-medium text-danger-700">· CP will re-upload</span>}
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
          </div>
          <ActionBar>
            <Button variant="danger" icon={<ThumbsDown className="size-4" />} onClick={() => setRejecting(true)}>
              Reject
            </Button>
            {legal && (
              <Button
                variant="secondary"
                icon={<FileWarning className="size-4" />}
                disabled={!canAskDocs}
                title={!canAskDocs ? 'Mark Mismatch on a CP document (PAN, Aadhaar, cancelled cheque or GST) first' : undefined}
                onClick={() => setAskingDocs(true)}
              >
                Request document changes{docMismatches.length ? ` (${docMismatches.length})` : ''}
              </Button>
            )}
            <Button variant="success" icon={legal ? <ThumbsUp className="size-4" /> : <ShieldCheck className="size-4" />} disabled={done !== fields.length} loading={approve.loading} onClick={() => void approve.run()}>
              {legal ? 'Approve & send to Admin' : 'Approve — make Active'}
            </Button>
          </ActionBar>
          {legal && mismatches > 0 && docMismatches.length === 0 && (
            <p className="text-sm text-muted">Something other than a CP document doesn’t match, so the agreement needs to be rejected and signed again.</p>
          )}
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
          title="Request document changes"
          description="The BD Executive sends the CP a link to re-upload these documents, checks the new files and sends the agreement back to you. The signed agreement does not need signing again."
          footer={
            <>
              <Button variant="secondary" onClick={() => setAskingDocs(false)}>
                Cancel
              </Button>
              <Button
                loading={askDocs.loading}
                icon={<FileWarning className="size-4" />}
                disabled={docMismatches.some((f) => !checks[f.key]?.remark?.trim())}
                onClick={async () => {
                  const items = docMismatches.map((f) => ({ documentId: d!.cpDocuments.find((x) => x.type === f.doc)!.id, remark: checks[f.key]!.remark!.trim() }));
                  if ((await askDocs.run(items, note)).ok) setAskingDocs(false);
                }}
              >
                Send to BD Executive
              </Button>
            </>
          }
        >
          <ul className="space-y-3">
            {docMismatches.map((f) => (
              <li key={f.key} className="rounded-lg border border-line p-3">
                <Field label={`${docLabel(f.doc!)} — what needs to change`} required>
                  <Textarea
                    rows={2}
                    value={checks[f.key]?.remark ?? ''}
                    placeholder="e.g. The scan is blurred — upload a clear copy of the original."
                    onChange={(e) => set(f.key, { remark: e.target.value })}
                  />
                </Field>
              </li>
            ))}
          </ul>
          {otherMismatches.length > 0 && (
            <Alert tone="warning" className="mt-4" title="Other items also don’t match">
              {otherMismatches.map((f) => f.label).join(' · ')}. Corrected CP documents won’t fix these; if the signed agreement itself is wrong, reject it instead.
            </Alert>
          )}
          <Field label="Note for the BD Executive" optional className="mt-4">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </Modal>
      )}
    </div>
  );
}
