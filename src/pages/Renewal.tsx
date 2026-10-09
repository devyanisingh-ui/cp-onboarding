import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarX, Pencil, RefreshCw, ThumbsDown, ThumbsUp } from 'lucide-react';
import { api } from '@/services/mockApi';
import { getDb } from '@/services/db';
import { useAction, useApi } from '@/hooks/useApi';
import { useDocumentTitle } from '@/hooks/misc';
import { daysUntil, formatDate, shiftDays } from '@/lib/dates';
import { CP_TYPE_LABELS } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Alert, Button, Card, CardBody, CardHeader, DL, ErrorState, Field, Modal, PageSkeleton, Select, Textarea } from '@/components/ui';
import { CommentDialog, PageHeader } from '@/components/common';

export function Renewal() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi(() => api.agreements.get(id), [id]);
  const [dnr, setDnr] = useState(false);
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [reasonErr, setReasonErr] = useState<string>();
  const [rejecting, setRejecting] = useState(false);
  useDocumentTitle(`Renewal ${id}`);
  const decide = useAction((dec: 'renew' | 'renew_with_changes' | 'do_not_renew', r?: string) => api.agreements.decideRenewal(id, dec, r), {
    onSuccess: (res) => {
      if (res.newAgreementId) navigate(`/agreements/${res.newAgreementId}/${pending === 'renew' ? 'preview' : 'edit?step=3'}`);
      else navigate(`/agreements/${id}`);
    },
    success: (res) => (res.newAgreementId ? `Renewal draft ${res.newAgreementId} created` : 'Sent to Admin to confirm'),
  });
  const [pending, setPending] = useState<'renew' | 'renew_with_changes' | null>(null);
  const confirm = useAction((dec: 'confirm' | 'reject', c?: string) => api.agreements.confirmNonRenewal(id, dec, c), { success: 'Decision recorded', onSuccess: () => navigate(`/agreements/${id}`) });

  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const d = data!;
  const a = d.agreement;
  const left = a.endDate ? daysUntil(a.endDate) : 0;
  const reasons = getDb().masterLists.nonRenewalReasons;
  const sla = getDb().settings.sla;

  const renew = (dec: 'renew' | 'renew_with_changes') => {
    setPending(dec);
    void decide.run(dec);
  };

  return (
    <div>
      <PageHeader breadcrumbs={[{ label: 'Agreements', to: '/agreements' }, { label: a.id, to: `/agreements/${a.id}` }, { label: 'Renewal' }]} title="Renewal decision" subtitle={`${d.cp.legalName} · ${d.institution.shortCode}`} />

      <Card className="mb-5">
        <CardBody className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className={cn('flex size-24 shrink-0 flex-col items-center justify-center rounded-2xl', left <= sla.renewalEscalationDays ? 'bg-danger-50 text-danger-700' : 'bg-orange-50 text-orange-800')}>
            <span className="text-3xl font-bold tabular-nums">{Math.max(left, 0)}</span>
            <span className="text-xs font-semibold">days left</span>
          </div>
          <div className="text-sm">
            <p className="text-base font-semibold">Expires {formatDate(a.endDate)}</p>
            <p className="mt-1 text-muted">
              Decide by {formatDate(a.endDate ? shiftDays(a.endDate, -sla.renewalEscalationDays) : '')}. After that it escalates to Admin, and with no decision at expiry it closes as “Expired without decision”.
            </p>
          </div>
        </CardBody>
      </Card>

      <Card className="mb-5">
        <CardHeader title="Current terms" />
        <CardBody>
          <DL
            items={[
              { label: 'CP type', value: CP_TYPE_LABELS[d.cp.type] },
              { label: 'Term', value: `${formatDate(a.startDate)} – ${formatDate(a.endDate)}` },
              { label: 'Rate card', value: `v${d.rateCard.version}${a.nonStandard ? ' with deviations' : ''}` },
              { label: 'Template', value: `v${d.template.version}` },
              { label: 'Location', value: d.locationName },
              { label: 'Owner', value: d.summary.ownerName },
            ]}
          />
          <p className="mt-4 text-xs text-muted">A renewal is created on the current published template and rate card. Deviations do not carry over automatically — request them again if still needed.</p>
        </CardBody>
      </Card>

      {d.actions.confirmNonRenewal && a.renewal && (
        <Card>
          <CardHeader title="Confirm “Do not renew”" description={`Requested by ${d.names[a.renewal.decidedById]}`} />
          <CardBody className="space-y-4">
            <Alert tone="warning">Reason: {a.renewal.reason}</Alert>
            <p className="text-sm text-muted">If you confirm, the agreement runs until {formatDate(a.endDate)} and then closes as “Expired – Not renewed”.</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" icon={<ThumbsDown className="size-4" />} onClick={() => setRejecting(true)}>
                Send back to BD Executive
              </Button>
              <Button icon={<ThumbsUp className="size-4" />} loading={confirm.loading} onClick={() => void confirm.run('confirm')}>
                Confirm non-renewal
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {d.actions.renewalDecision && (
        <div className="grid gap-3 sm:grid-cols-3">
          <DecisionCard icon={<RefreshCw />} title="Renew" body="Same terms on the current template and rate card. Starts the day after expiry." onClick={() => renew('renew')} loading={decide.loading && pending === 'renew'} primary />
          <DecisionCard icon={<Pencil />} title="Renew with changes" body="Opens the renewal draft so you can edit details before submitting." onClick={() => renew('renew_with_changes')} loading={decide.loading && pending === 'renew_with_changes'} />
          <DecisionCard icon={<CalendarX />} title="Do not renew" body="Needs a reason and Admin’s confirmation." onClick={() => setDnr(true)} />
        </div>
      )}

      {!d.actions.renewalDecision && !d.actions.confirmNonRenewal && (
        <Alert tone="info">
          {a.renewal ? 'A renewal decision has already been made for this agreement.' : a.status !== 'active' ? 'Only active agreements can be renewed.' : `Renewal decisions open ${sla.renewalLeadDays} days before expiry, and are made by the BD Executive.`}
        </Alert>
      )}

      <Modal
        open={dnr}
        onClose={() => setDnr(false)}
        title="Do not renew"
        description="Admin must confirm. The agreement stays active until its expiry date."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDnr(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={decide.loading}
              onClick={() => {
                const r = reason === 'Other' ? other.trim() : reason;
                if (!r || r.length < 5) return setReasonErr('Choose a reason (or describe it)');
                void decide.run('do_not_renew', r);
              }}
            >
              Send for confirmation
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Reason" required error={reasonErr}>
            <Select value={reason} onChange={(e) => (setReason(e.target.value), setReasonErr(undefined))}>
              <option value="">Choose a reason</option>
              {reasons.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>
          {reason === 'Other' && (
            <Field label="Describe the reason" required>
              <Textarea value={other} onChange={(e) => setOther(e.target.value)} />
            </Field>
          )}
        </div>
      </Modal>
      <CommentDialog open={rejecting} onClose={() => setRejecting(false)} title="Don’t confirm non-renewal" description="The BD Executive gets a new renewal decision task." confirmLabel="Send back" onConfirm={async (c) => (await confirm.run('reject', c)).ok} />
    </div>
  );
}

function DecisionCard({ icon, title, body, onClick, loading, primary }: { icon: ReactNode; title: string; body: string; onClick: () => void; loading?: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(
        'surface surface-interactive flex flex-col items-start gap-2 rounded-xl p-5 text-left disabled:opacity-60',
        primary && 'ring-2 ring-primary-500/30',
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-lg bg-primary-50 text-primary-700 [&_svg]:size-5">{icon}</span>
      <span className="text-base font-semibold text-ink">{loading ? 'Working…' : title}</span>
      <span className="text-sm text-muted">{body}</span>
    </button>
  );
}
