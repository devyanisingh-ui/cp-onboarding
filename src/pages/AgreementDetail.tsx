import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Ban, CalendarClock, FileSearch, FileSignature, Flag, History, Link2, Mail, Pencil, PenLine, RefreshCw, Scale, ShieldAlert, ShieldCheck, Upload } from 'lucide-react';
import type { ESigner, ESignRequest } from '@/types';
import { api, type AgreementDetail as AgreementDetailData } from '@/services/mockApi';
import { useAction, useApi } from '@/hooks/useApi';
import { useDocumentTitle } from '@/hooks/misc';
import { formatDate, formatDateTime, daysUntil } from '@/lib/dates';
import { CP_TYPE_LABELS, formatInr } from '@/lib/format';
import { STATUS_META, type StatusTone } from '@/lib/status';
import { Alert, Badge, Button, ButtonLink, Card, CardBody, CardHeader, DL, ErrorState, PageSkeleton, StatusBadge } from '@/components/ui';
import { AgreementLink, CommentDialog, DocumentList, PageHeader, StatusStepper, Timeline, WarningBanner } from '@/components/common';
import { DeviationCompare, DownloadMenu } from '@/components/agreement';

export function AgreementDetail() {
  const { id = '' } = useParams();
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
            <Link to={`/cps/${d.cp.id}`} className="hit-area font-medium text-primary-700 hover:underline">
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
            {act.sendForSignature && (
              <ButtonLink to={`/agreements/${a.id}/esign`} icon={<PenLine className="size-4" />}>
                {a.esign ? 'Send for e-signature again' : 'Send for e-signature'}
              </ButtonLink>
            )}
            {act.uploadSigned && (
              <ButtonLink to={`/agreements/${a.id}/upload`} variant={act.sendForSignature ? 'secondary' : 'primary'} icon={<Upload className="size-4" />}>
                {a.source === 'legacy' ? 'Upload scan' : act.sendForSignature ? 'Upload paper copy' : 'Upload signed copy'}
              </ButtonLink>
            )}
            {act.verifyGate2 && (
              <ButtonLink to={`/agreements/${a.id}/verify`} icon={<ShieldCheck className="size-4" />}>
                Verify (Gate 2)
              </ButtonLink>
            )}
            {act.approveGate1 && (
              <ButtonLink to={`/agreements/${a.id}/preview`} icon={<ShieldCheck className="size-4" />}>
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
        {a.lastRejection && (
          <Alert tone="error" title={`${a.lastRejection.gate === 1 ? "Returned by Legal" : "Returned at Gate 2"} (${d.names[a.lastRejection.byId]}) · ${formatDateTime(a.lastRejection.at)}`}>
            {a.lastRejection.comment}
          </Alert>
        )}
        {act.uploadSigned && a.source === 'app' && a.status === 'approved_for_signing' && a.esign?.status !== 'in_progress' && (
          <SigningChoice agreementId={a.id} signatory={`${a.signatoryName}, ${a.signatoryDesignation}`} cpName={d.cp.legalName} canEsign={act.sendForSignature} />
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
            <StatusStepper status={a.status} nonStandard={a.nonStandard} />
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
              <DeviationCompare deviations={d.deviations} names={d.names} />
            </Card>
          )}
          <Card>
            <CardHeader title="Agreement documents" icon={<FileSignature />} />
            <DocumentList docs={d.documents} names={d.names} empty="The signed copy and stamp paper scan appear here after upload." />
          </Card>
          <Card>
            <CardHeader title="CP KYC documents" />
            <DocumentList docs={d.cpDocuments} names={d.names} />
          </Card>
        </div>

        <aside className="min-w-0 space-y-5">
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
            “{declined.declineReason}” — fix what’s needed, then send for e-signature again (or use the paper copy).
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
            <Link to={`/sign/${current.token}`} className="hit-area font-medium text-primary-700 hover:underline">
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

/** Approved for signing: the two ways to get it signed, so the paper route isn't missed. */
function SigningChoice({ agreementId, signatory, cpName, canEsign }: { agreementId: string; signatory: string; cpName: string; canEsign: boolean }) {
  const step = (n: number, text: string) => (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700">{n}</span>
      <span>{text}</span>
    </li>
  );
  return (
    <Card>
      <CardHeader title="How will this be signed?" description="Choose either route. Both end with the agreement Active." />
      <CardBody className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 font-semibold">
            <FileSignature className="size-4 text-muted" aria-hidden /> Sign on paper
          </h3>
          <ol className="space-y-2.5 text-sm text-ink-soft">
            {step(1, 'Download the agreement and print two copies on stamp paper.')}
            {step(2, `Get every page signed by ${cpName} and by ${signatory}.`)}
            {step(3, 'Upload the scanned signed copy and the stamp paper. Admin verifies it (Gate 2), then it becomes Active.')}
          </ol>
          <div className="flex flex-wrap gap-2">
            <DownloadMenu agreementId={agreementId} />
            <ButtonLink to={`/agreements/${agreementId}/upload`} variant="secondary" icon={<Upload className="size-4" />}>
              Upload signed copy
            </ButtonLink>
          </div>
        </div>
        {canEsign && (
          <div className="space-y-4 md:border-l md:border-line md:pl-6">
            <h3 className="flex items-center gap-2 font-semibold">
              <PenLine className="size-4 text-muted" aria-hidden /> E-signature
            </h3>
            <ol className="space-y-2.5 text-sm text-ink-soft">
              {step(1, `${cpName} gets an email link and signs first.`)}
              {step(2, `${signatory} gets their link next.`)}
              {step(3, 'Once both have signed, the signed PDF is filed and the agreement becomes Active.')}
            </ol>
            <ButtonLink to={`/agreements/${agreementId}/esign`} icon={<PenLine className="size-4" />}>
              Send for e-signature
            </ButtonLink>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
