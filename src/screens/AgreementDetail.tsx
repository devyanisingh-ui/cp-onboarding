'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Ban, CalendarClock, CheckCircle2, FileSearch, FileSignature, FileWarning, Flag, History, IdCard, Link2, Mail, Pencil, PenLine, RefreshCw, Scale, Send, ShieldAlert, ShieldCheck, Upload } from 'lucide-react';
import type { DocRequest, DocRequestItem, DocumentRecord, ESigner, ESignRequest } from '@/types';
import { api, type AgreementDetail as AgreementDetailData, type CpDTO } from '@/services/mockApi';
import { errorMessage } from '@/services/errors';
import { useAction, useApi } from '@/hooks/useApi';
import { combineToPdf } from '@/lib/pdf';
import { cpCheck, cpCheckLabel } from '@/lib/cpChecks';
import { kycLabel } from '@/lib/kyc';
import { EditCpModal } from '@/components/EditCpModal';
import { useDocumentTitle } from '@/hooks/misc';
import { formatDate, formatDateTime, daysUntil } from '@/lib/dates';
import { CP_TYPE_LABELS, formatInr } from '@/lib/format';
import { rejectionTitle, STATUS_META, type StatusTone } from '@/lib/status';
import { Alert, Badge, Button, ButtonLink, Card, CardBody, CardHeader, DL, ErrorState, Field, PageSkeleton, StatusBadge, Textarea, useToast } from '@/components/ui';
import { AgreementLink, CommentDialog, DocumentList, FileDrop, PageHeader, StatusStepper, Timeline, WarningBanner } from '@/components/common';
import { DeviationCompare, DownloadMenu } from '@/components/agreement';
import { ContactVerificationCard } from '@/components/contactVerification';

export function AgreementDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useApi(() => api.agreements.get(id), [id]);
  const [override, setOverride] = useState<'approve' | 'reject' | null>(null);
  useDocumentTitle(id);
  const decideOverride = useAction((d: 'approve' | 'reject', r: string) => api.agreements.decideOverride(id, d, r), { success: 'Override decision recorded' });
  const clearFlag = useAction(() => api.agreements.clearReviewFlag(id), { success: 'Marked as reviewed' });

  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const d = data!;
  const a = d.agreement;
  const act = d.actions;
  const left = a.endDate ? daysUntil(a.endDate) : null;
  const terminal = ['terminated', 'expired', 'not_renewed', 'expired_no_decision'].includes(a.status);

  return (
    <div>
      <PageHeader
        title={d.cp.legalName}
        subtitle={
          <span className="flex flex-wrap gap-x-2">
            <span className="font-mono">{a.id}</span>·<span>{d.institution.shortCode}</span>·<span>{CP_TYPE_LABELS[d.cp.type]}</span>·
            <Link href={`/cps/${d.cp.id}`} className="hit-area font-medium text-primary-700 hover:underline">
              View CP
            </Link>
          </span>
        }
        badges={
          <>
            <StatusBadge status={d.summary.displayStatus} />
            {a.nonStandard && <Badge tone="orange">Non-standard</Badge>}
            {a.source === 'legacy' && <Badge tone="grey">Legacy</Badge>}
          </>
        }
        actions={
          <>
            <ButtonLink to={`/agreements/${a.id}/preview`} variant="secondary" icon={<FileSearch className="size-4" />}>
              Preview
            </ButtonLink>
            <DownloadMenu agreementId={a.id} />
            {act.edit && (
              <ButtonLink to={`/agreements/${a.id}/edit?step=3`} icon={<Pencil className="size-4" />}>
                Continue editing
              </ButtonLink>
            )}
            {act.requestDeviation && (
              <ButtonLink to={`/agreements/${a.id}/deviation`} variant="secondary" icon={<Scale className="size-4" />}>
                Request deviation
              </ButtonLink>
            )}
            {act.uploadSigned && (
              <ButtonLink to={`/agreements/${a.id}/upload`} icon={<Upload className="size-4" />}>
                {a.source === 'legacy' ? 'Upload scan' : 'Upload signed copy'}
              </ButtonLink>
            )}
            {act.verifyGate2 && (
              <ButtonLink to={`/agreements/${a.id}/verify`} icon={<ShieldCheck className="size-4" />}>
                Verify (Gate 2)
              </ButtonLink>
            )}
            {act.approveGate1 && (
              <ButtonLink to={`/agreements/${a.id}/legal-review`} icon={<ShieldCheck className="size-4" />}>
                Legal review
              </ButtonLink>
            )}
            {(act.renewalDecision || act.confirmNonRenewal) && (
              <ButtonLink to={`/agreements/${a.id}/renewal`} icon={<RefreshCw className="size-4" />}>
                {act.confirmNonRenewal ? 'Confirm non-renewal' : 'Renew'}
              </ButtonLink>
            )}
            {(act.terminate || act.confirmTermination) && (
              <ButtonLink to={`/agreements/${a.id}/terminate`} variant={act.confirmTermination ? 'primary' : 'secondary'} icon={<Ban className="size-4" />}>
                {act.confirmTermination ? 'Confirm termination' : 'Terminate'}
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="mb-5 space-y-3">
        {d.cp.warning && <WarningBanner reason={d.cp.warning.reason} />}
        {a.lastRejection && !(a.docRequest && a.docRequest.status !== 'closed') && (
          <Alert tone="error" title={`${rejectionTitle(a.lastRejection.gate)} (${d.names[a.lastRejection.byId]}) · ${formatDateTime(a.lastRejection.at)}`}>
            {a.lastRejection.comment}
          </Alert>
        )}
        {a.docRequest && a.docRequest.status !== 'closed' && (
          <DocRequestPanel agreementId={a.id} cp={d.cp} req={a.docRequest} docs={d.cpDocuments} names={d.names} canFix={act.fixCpDetails} />
        )}
        {act.uploadSigned && a.source === 'app' && a.status === 'approved_for_signing' && a.esign?.status !== 'in_progress' && (
          <SigningChoice agreementId={a.id} signatory={`${a.signatoryName}, ${a.signatoryDesignation}`} cpName={d.cp.legalName} />
        )}
        {a.override && (
          <Alert
            tone={a.override.status === 'approved' ? 'success' : a.override.status === 'rejected' ? 'error' : 'warning'}
            title={a.override.status === 'pending' ? 'Admin override pending' : a.override.status === 'approved' ? 'Admin override granted' : 'Admin override refused'}
            action={
              act.decideOverride ? (
                <>
                  <Button size="sm" variant="success" onClick={() => setOverride('approve')}>
                    Grant override
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setOverride('reject')}>
                    Refuse
                  </Button>
                </>
              ) : undefined
            }
          >
            Requested by {d.names[a.override.requestedById]}: “{a.override.requestReason}”
            {a.override.decisionReason && <> · Decision by {d.names[a.override.decidedById ?? '']}: “{a.override.decisionReason}”</>}
          </Alert>
        )}
        {a.reviewFlag && (
          <Alert tone="warning" title="Flagged for review after a rate revision" action={<Button size="sm" variant="secondary" icon={<Flag className="size-4" />} loading={clearFlag.loading} onClick={() => void clearFlag.run()}>Mark as reviewed</Button>}>
            {a.reviewFlag.reason} Terms were not changed automatically.
          </Alert>
        )}
        {a.termination && a.termination.confirmation !== 'rejected' && (
          <Alert tone={a.status === 'terminated' ? 'error' : 'warning'} title={a.termination.confirmation === 'pending' ? 'Termination awaiting Admin confirmation' : a.status === 'terminated' ? 'Terminated' : 'In notice period'}>
            {a.termination.type === 'breach' ? 'For breach' : 'For convenience'}: {a.termination.reason}. Notice {formatDate(a.termination.noticeDate)}, effective {formatDate(a.termination.effectiveDate)}.
          </Alert>
        )}
        {a.renewal && (
          <Alert tone="info" title="Renewal decision">
            {a.renewal.decision === 'do_not_renew' ? (
              <>
                Do not renew — “{a.renewal.reason}” ({a.renewal.confirmation === 'confirmed' ? 'confirmed by Admin' : a.renewal.confirmation === 'rejected' ? 'not confirmed; re-decision requested' : 'awaiting Admin confirmation'}).
              </>
            ) : (
              <>
                {a.renewal.decision === 'renew' ? 'Renew' : 'Renew with changes'} by {d.names[a.renewal.decidedById]} on {formatDate(a.renewal.decidedAt.slice(0, 10))}
                {a.renewal.successorId && (
                  <>
                    {' '}→ <AgreementLink id={a.renewal.successorId} />
                  </>
                )}
              </>
            )}
          </Alert>
        )}
        {a.status === 'active' && left !== null && left <= 60 && !a.renewal && (
          <Alert tone="warning" title={`Expires in ${left} days`}>
            A renewal decision is due by {formatDate(a.endDate ? new Date(Date.parse(a.endDate) - 30 * 86400000).toISOString().slice(0, 10) : '')}.
          </Alert>
        )}
      </div>

      {!terminal && (
        <Card className="mb-5">
          <CardBody>
            <StatusStepper status={a.status} nonStandard={a.nonStandard} legacy={a.source === 'legacy'} />
          </CardBody>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {a.esign && <ESignCard d={d} onChange={reload} />}
          <Card>
            <CardHeader title="Key dates and terms" icon={<CalendarClock />} />
            <CardBody>
              <DL
                cols={3}
                items={[
                  { label: 'Execution', value: a.executionDate ? `${formatDate(a.executionDate)}, ${a.executionPlace ?? ''}` : null },
                  { label: 'Commencement', value: formatDate(a.startDate) },
                  { label: 'Expiry', value: a.endDate ? `${formatDate(a.endDate)}${a.status === 'active' && left !== null ? ` (${left} days)` : ''}` : null },
                  { label: 'Location', value: d.locationName },
                  { label: 'Signing authority', value: `${a.signatoryName}, ${a.signatoryDesignation}` },
                  { label: 'Coordinator', value: a.coordinatorName },
                  { label: 'Template', value: `${CP_TYPE_LABELS[d.template.cpType]} v${d.template.version}` },
                  { label: 'Rate card', value: `${d.institution.shortCode} v${d.rateCard.version} (from ${formatDate(d.rateCard.effectiveFrom)})` },
                  { label: 'Owner', value: d.summary.ownerName },
                  ...(a.stampPaper ? [{ label: a.esign ? 'E-stamp' : 'Stamp paper', value: `${a.stampPaper.number} · ${formatInr(a.stampPaper.valueInr)} · ${a.stampPaper.state}` }] : []),
                  ...(a.signedOn ? [{ label: 'Signed', value: `${formatDate(a.signedOn)}${a.signedById ? ` by ${d.names[a.signedById]}` : ''}` }] : []),
                  ...(a.activatedAt ? [{ label: 'Active since', value: formatDate(a.activatedAt.slice(0, 10)) }] : []),
                ]}
              />
            </CardBody>
          </Card>
          {d.deviations.length > 0 && (
            <Card>
              <CardHeader title="Deviations" icon={<Scale />} action={<ButtonLink to={`/agreements/${a.id}/deviation`} variant="link" size="sm">Open panel</ButtonLink>} />
              <DeviationCompare deviations={d.deviations} names={d.names} docs={d.documents} />
            </Card>
          )}
          <Card>
            <CardHeader title="Agreement documents" icon={<FileSignature />} />
            <DocumentList docs={d.documents} names={d.names} empty="The signed copy and stamp paper scan appear here after upload." />
          </Card>
          <Card>
            <CardHeader title="CP KYC documents" icon={<IdCard />} />
            <DocumentList docs={d.cpDocuments} names={d.names} />
          </Card>
        </div>

        <aside className="min-w-0 space-y-5">
          <ContactVerificationCard cpId={d.cp.id} email={d.cp.email} mobile={d.cp.mobile} contact={d.cp.contact} />
          {d.openTasks.length > 0 && (
            <Card>
              <CardHeader title="Waiting on" icon={<ShieldAlert />} />
              <ul className="divide-y divide-line">
                {d.openTasks.map((t) => (
                  <li key={t.id} className="px-5 py-3 text-sm">
                    <p className="font-medium">{t.title}</p>
                    <p className="text-xs text-muted">
                      {t.assigneeName} · due {formatDate(t.dueDate)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {(d.predecessor || d.successor) && (
            <Card>
              <CardHeader title="Renewal history" icon={<Link2 />} />
              <ul className="divide-y divide-line text-sm">
                {d.predecessor && (
                  <li className="flex items-center justify-between gap-2 px-5 py-3">
                    <span>
                      <span className="block text-xs text-muted">Previous</span>
                      <AgreementLink id={d.predecessor.id} />
                    </span>
                    <StatusBadge status={d.predecessor.displayStatus} />
                  </li>
                )}
                {d.successor && (
                  <li className="flex items-center justify-between gap-2 px-5 py-3">
                    <span>
                      <span className="block text-xs text-muted">Renewal</span>
                      <AgreementLink id={d.successor.id} />
                    </span>
                    <StatusBadge status={d.successor.displayStatus} />
                  </li>
                )}
              </ul>
            </Card>
          )}
          <Card>
            <CardHeader title="Timeline" icon={<History />} />
            <Timeline events={d.events} limit={10} />
          </Card>
          <p className="px-1 text-xs text-muted">Status colours: {Object.values(STATUS_META).slice(0, 6).map((m) => m.label).join(' · ')}</p>
        </aside>
      </div>

      <CommentDialog
        open={!!override}
        onClose={() => setOverride(null)}
        title={override === 'approve' ? 'Grant Admin override' : 'Refuse Admin override'}
        description="Your reason is recorded in the audit log."
        confirmLabel={override === 'approve' ? 'Grant override' : 'Refuse'}
        tone={override === 'approve' ? 'primary' : 'danger'}
        placeholder="Reason"
        onConfirm={async (c) => (await decideOverride.run(override!, c)).ok}
      />
    </div>
  );
}

const SIGNER_STATUS: Record<ESigner['status'], { label: string; tone: StatusTone }> = {
  waiting: { label: 'Waiting', tone: 'grey' },
  sent: { label: 'Link sent', tone: 'amber' },
  signed: { label: 'Signed', tone: 'green' },
  declined: { label: 'Declined', tone: 'red' },
};

const REQUEST_STATUS: Record<ESignRequest['status'], { label: string; tone: StatusTone }> = {
  in_progress: { label: 'In progress', tone: 'purple' },
  completed: { label: 'All signed', tone: 'green' },
  declined: { label: 'Declined', tone: 'red' },
  cancelled: { label: 'Withdrawn', tone: 'grey' },
};

/** Progress of the digital-signature request: who signs, how, and where it stands. */
function ESignCard({ d, onChange }: { d: AgreementDetailData; onChange: () => void }) {
  const a = d.agreement;
  const req = a.esign!;
  const [withdrawing, setWithdrawing] = useState(false);
  const resend = useAction(() => api.agreements.resendSignatureEmail(a.id), { success: 'Signing email sent again', onSuccess: onChange });
  const withdraw = useAction((reason: string) => api.agreements.cancelSignature(a.id, reason), { success: 'Signature request withdrawn', onSuccess: onChange });
  const current = req.status === 'in_progress' ? req.signers.find((s) => s.status === 'sent') : undefined;
  const declined = req.signers.find((s) => s.status === 'declined');

  return (
    <Card>
      <CardHeader
        title="E-signature"
        description={`Sent by ${d.names[req.sentById] ?? 'BD Executive'} on ${formatDateTime(req.sentAt)}${req.signEveryPage ? ' · signing every page' : ''}`}
        icon={<PenLine />}
        action={<Badge tone={REQUEST_STATUS[req.status].tone}>{REQUEST_STATUS[req.status].label}</Badge>}
      />
      <ol className="divide-y divide-line">
        {req.signers.map((s) => (
          <li key={s.role} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm">
            <span className="min-w-0">
              <span className="font-medium">
                {s.order}. {s.name}
              </span>
              <span className="text-muted"> · {s.role === 'cp' ? 'Channel Partner' : (s.designation ?? 'Institution')}</span>
              <span className="block text-xs text-muted">
                {s.method === 'dsc' ? 'Digital signature certificate (DSC)' : 'Drawn or typed signature'} · {s.email}
              </span>
              <span className="block text-xs text-muted">
                {s.status === 'signed'
                  ? `Signed ${formatDateTime(s.signedAt)}${s.signature?.kind === 'dsc' ? ` · certificate ${s.signature.certificate?.serial}` : s.signature ? ` · ${s.signature.kind}` : ''}`
                  : s.status === 'sent'
                    ? `Link sent ${formatDateTime(s.sentAt)}${s.viewedAt ? ` · opened ${formatDateTime(s.viewedAt)}` : ' · not opened yet'}`
                    : s.status === 'declined'
                      ? `Declined ${formatDateTime(s.declinedAt)}`
                      : 'Gets the link after the previous signer'}
              </span>
            </span>
            <Badge tone={SIGNER_STATUS[s.status].tone}>{SIGNER_STATUS[s.status].label}</Badge>
          </li>
        ))}
      </ol>
      {declined && (
        <div className="border-t border-line px-5 py-3">
          <Alert tone="error" title={`${declined.name} declined to sign`}>
            “{declined.declineReason}” — fix what’s needed, then sign it on paper and upload it.
          </Alert>
        </div>
      )}
      {d.actions.manageSignature && current && (
        <div className="space-y-3 border-t border-line px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<Mail className="size-4" />} loading={resend.loading} onClick={() => void resend.run()}>
              Resend signing email
            </Button>
            <Button size="sm" variant="ghost" icon={<Ban className="size-4" />} onClick={() => setWithdrawing(true)}>
              Withdraw request
            </Button>
          </div>
          <p className="text-xs text-muted">
            Prototype: emails go to the outbox in Admin → System.{' '}
            <Link href={`/sign/${current.token}`} className="hit-area font-medium text-primary-700 hover:underline">
              Open {current.name}’s signing page
            </Link>{' '}
            to act as the signer.
          </p>
        </div>
      )}
      <CommentDialog
        open={withdrawing}
        onClose={() => setWithdrawing(false)}
        title="Withdraw signature request"
        description="The signing links stop working and the current signer is told by email. Signatures already given are discarded."
        confirmLabel="Withdraw"
        placeholder="Reason"
        onConfirm={async (c) => (await withdraw.run(c)).ok}
      />
    </Card>
  );
}

/** Ready for signing: how to get it signed on paper and uploaded. */
function SigningChoice({ agreementId, signatory, cpName }: { agreementId: string; signatory: string; cpName: string }) {
  const step = (n: number, text: string) => (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700">{n}</span>
      <span>{text}</span>
    </li>
  );
  return (
    <Card>
      <CardHeader title="How will this be signed?" description="Sign it on paper and upload it. It then goes to Legal for review; Legal’s approval makes it Active." icon={<FileSignature />} />
      <CardBody>
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 font-semibold">
            <FileSignature className="size-4 text-muted" aria-hidden /> Sign on paper
          </h3>
          <ol className="space-y-2.5 text-sm text-ink-soft">
            {step(1, 'Download the agreement and print two copies on stamp paper.')}
            {step(2, `Get every page signed by ${cpName} and by ${signatory}.`)}
            {step(3, 'Upload the scanned signed copy and the stamp paper. It then goes to Legal for review.')}
          </ol>
          <div className="flex flex-wrap gap-2">
            <DownloadMenu agreementId={agreementId} />
            <ButtonLink to={`/agreements/${agreementId}/upload`} variant="secondary" icon={<Upload className="size-4" />}>
              Upload signed copy
            </ButtonLink>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/** Legal → BD → Legal: the CP details Legal flagged. The BD corrects them or uploads corrected documents, then sends it back. */
function DocRequestPanel({ agreementId, cp, req, docs, names, canFix }: { agreementId: string; cp: CpDTO; req: DocRequest; docs: DocumentRecord[]; names: Record<string, string>; canFix: boolean }) {
  const [note, setNote] = useState('');
  // The flagged item whose details the BD is correcting.
  const [editing, setEditing] = useState<DocRequestItem | null>(null);
  const send = useAction(() => api.agreements.resubmitCorrectedDocs(agreementId, note), { success: 'Corrected details sent to Legal' });
  const byId = (docId?: string) => docs.find((x) => x.id === docId);
  const fixed = (it: DocRequestItem) => !!(it.detailsUpdatedAt || it.replacementId);
  const missing = req.items.filter((it) => !fixed(it)).length;
  return (
    <Card>
      <CardHeader
        title="Legal sent CP details back"
        description={`${names[req.requestedById] ?? 'Legal'} · ${formatDateTime(req.requestedAt)} · ${
          missing ? `${req.items.length - missing} of ${req.items.length} fixed — correct the details or upload corrected documents, then send it back to Legal` : 'All fixed — send the agreement back to Legal'
        }`}
        icon={<FileWarning />}
      />
      <CardBody className="space-y-4">
        {req.note && <p className="text-sm text-ink-soft">“{req.note}”</p>}
        <ul className="space-y-3">
          {req.items.map((it) => (
            <FlaggedItem key={it.key} agreementId={agreementId} label={cpCheckLabel(it.key, cp.type)} docName={it.documentType && kycLabel(cp.type, it.documentType)} item={it} previous={byId(it.documentId)} replacement={byId(it.replacementId)} canFix={canFix} onCorrect={() => setEditing(it)} />
          ))}
        </ul>
        {canFix && (
          <div className="space-y-3 border-t border-line pt-4">
            <Field label="Note for Legal" optional>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Corrected the GSTIN; the CP sent a clear scan of the PAN card." />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="success" icon={<Send className="size-4" />} disabled={missing > 0} loading={send.loading} onClick={() => void send.run()}>
                Send to Legal
              </Button>
              {missing > 0 && <p className="text-sm text-muted">Fix {missing === 1 ? 'the last flagged item' : `the ${missing} flagged items`} first. Legal re-checks only these.</p>}
            </div>
          </div>
        )}
      </CardBody>
      {editing && (
        <EditCpModal
          cp={cp}
          title={`Correct: ${cpCheckLabel(editing.key, cp.type)}`}
          intro={
            <Alert tone="warning" className="mb-4" title="Legal’s remark">
              {editing.remark}
            </Alert>
          }
          save={(v) => api.agreements.correctFlaggedDetails(agreementId, v)}
          success={(r) => (r.fixed ? `CP details saved — ${r.fixed} flagged item${r.fixed === 1 ? '' : 's'} corrected` : 'CP details saved. None of the flagged details changed.')}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

/** One flagged CP detail: Legal's remark, what the BD has done, and an upload for its corrected document. */
function FlaggedItem({
  agreementId,
  label,
  docName,
  item,
  previous,
  replacement,
  canFix,
  onCorrect,
}: {
  agreementId: string;
  label: string;
  docName?: string;
  item: DocRequestItem;
  previous?: DocumentRecord;
  replacement?: DocumentRecord;
  canFix: boolean;
  /** Opens the CP details form to correct this item. */
  onCorrect: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const docType = item.documentType;
  const editable = !!cpCheck(item.key)?.fields.length;
  const upload = async (files: File[]) => {
    setBusy(true);
    setErr(undefined);
    try {
      const f = await combineToPdf(files, docType!);
      await api.agreements.uploadCorrectedDoc(agreementId, item.key, f.blob, f.fileName);
      toast.success('Corrected document uploaded');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const correctLabel = item.detailsUpdatedAt ? 'Correct again' : 'Correct details';
  const done = [item.detailsUpdatedAt && 'Details corrected', replacement && `Corrected document: ${replacement.fileName}`].filter(Boolean);
  return (
    <li className="rounded-lg border border-line p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-sm text-danger-700">{item.remark}</p>
          {previous && <p className="mt-0.5 text-xs text-muted">Document Legal checked: {previous.fileName}</p>}
        </div>
        <div className="shrink-0 text-xs sm:text-right">
          {done.length ? (
            done.map((t) => (
              <p key={t as string} className="inline-flex items-center gap-1 font-medium text-success-700 sm:flex sm:justify-end">
                <CheckCircle2 className="size-3.5" aria-hidden /> {t}
              </p>
            ))
          ) : (
            <span className="text-muted">Not fixed yet</span>
          )}
        </div>
      </div>
      {canFix && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted">
            {editable && docType
              ? 'If the entered value is wrong, correct the details; if the document is wrong, upload a corrected copy.'
              : editable
                ? 'Correct the details the CP gave.'
                : 'This detail can’t be edited; upload a corrected copy.'}
          </p>
          {editable && (
            <Button variant="secondary" size="sm" icon={<Pencil className="size-4" />} onClick={onCorrect} aria-label={`${correctLabel}: ${label}`}>
              {correctLabel}
            </Button>
          )}
          {docType && (
            <FileDrop
              label={`${replacement ? 'Replace the corrected copy' : 'Upload a corrected copy'}: ${docName}`}
              hint="One PDF, or photos of each page"
              multiple
              disabled={busy}
              error={err}
              onFiles={(files) => void upload(files)}
            />
          )}
        </div>
      )}
    </li>
  );
}
