import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Scale, Send, X } from 'lucide-react';
import { SLABS, type Deviation } from '@/types';
import { api } from '@/services/mockApi';
import type { DeviationRequestItem } from '@/services/api/agreements';
import { useAction, useApi } from '@/hooks/useApi';
import { useDocumentTitle } from '@/hooks/misc';
import { clausesFor, effectiveRates } from '@/lib/agreementTemplate';
import { formatInr } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, Field, Input, PageSkeleton, Select, Table, TD, TH, Textarea } from '@/components/ui';
import { ActionBar, PageHeader } from '@/components/common';
import { DeviationCompare } from '@/components/agreement';

export function DeviationPanel() {
  const { id = '' } = useParams();
  const { data, error, loading, reload } = useApi(() => api.agreements.get(id), [id]);
  useDocumentTitle(`Deviation ${id}`);
  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const d = data!;
  const pending = d.deviations.filter((x) => x.status === 'pending');
  const decided = d.deviations.filter((x) => x.status !== 'pending');
  const crumbs = [{ label: 'Agreements', to: '/agreements' }, { label: d.agreement.id, to: `/agreements/${d.agreement.id}` }, { label: 'Deviation' }];

  return (
    <div>
      <PageHeader
        breadcrumbs={crumbs}
        title="Deviation panel"
        subtitle={`${d.cp.legalName} · ${d.institution.shortCode} · Rate card v${d.rateCard.version}. Changes apply to this agreement only — the master template and rate card are never edited.`}
        badges={d.agreement.nonStandard ? <Badge tone="orange">Non-standard</Badge> : <Badge tone="grey">Standard terms</Badge>}
      />
      <div className="space-y-6">
        {d.actions.decideDeviation && <LegalReview pending={pending} names={d.names} />}
        {d.actions.requestDeviation && <RequestForm detail={d} hasPending={pending.length > 0} />}
        {!d.actions.decideDeviation && !d.actions.requestDeviation && (
          <Alert tone="info">
            {d.agreement.status !== 'draft' ? 'Deviations can only be requested or decided while the agreement is a draft.' : 'You can view deviations here. BD Executives request them and Legal decides.'}
          </Alert>
        )}
        {!d.actions.decideDeviation && pending.length > 0 && (
          <Card>
            <CardHeader title="Awaiting Legal" />
            <DeviationCompare deviations={pending} names={d.names} />
          </Card>
        )}
        <Card>
          <CardHeader title="Decided deviations" />
          {decided.length ? <DeviationCompare deviations={decided} names={d.names} /> : <EmptyState compact icon={<Scale />} title="No decided deviations" description="Legal decisions will be listed here with who approved them." />}
        </Card>
      </div>
    </div>
  );
}

function RequestForm({ detail, hasPending }: { detail: Awaited<ReturnType<typeof api.agreements.get>>; hasPending: boolean }) {
  const navigate = useNavigate();
  const rates = useMemo(() => effectiveRates(detail.rateCard, detail.deviations), [detail]);
  const clauses = clausesFor(detail.institution, detail.template);
  const [cells, setCells] = useState<Record<string, string>>({});
  const [clauseId, setClauseId] = useState('');
  const [clauseText, setClauseText] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string>();
  const send = useAction((items: DeviationRequestItem[], r: string) => api.agreements.requestDeviation(detail.agreement.id, items, r), {
    success: 'Deviation sent to Legal',
    onSuccess: () => navigate(`/agreements/${detail.agreement.id}/preview`),
  });

  const items = (): DeviationRequestItem[] => {
    const out: DeviationRequestItem[] = Object.entries(cells)
      .filter(([, v]) => v !== '')
      .map(([ref, v]) => ({ type: 'rate', ref, proposedValue: v }));
    const std = clauses.find((c) => c.id === clauseId)?.text(detail.institution);
    if (clauseId && clauseText.trim() && clauseText.trim() !== std) out.push({ type: 'clause', ref: clauseId, proposedValue: clauseText });
    return out;
  };
  const submit = () => {
    const list = items();
    if (!list.length) return setErr('Change at least one rate cell or clause.');
    if (reason.trim().length < 5) return setErr('Give a reason Legal can assess (at least 5 characters).');
    setErr(undefined);
    void send.run(list, reason);
  };
  const cell = (ref: string, current: number) => {
    const v = cells[ref];
    const changed = v !== undefined && v !== '' && Number(v) !== current;
    return (
      <Input
        type="number"
        min={0}
        step={500}
        aria-label={`Rate ${ref}`}
        value={v ?? String(current)}
        onChange={(e) => setCells((c) => ({ ...c, [ref]: e.target.value === String(current) ? '' : e.target.value }))}
        className={cn('h-9 w-28 text-right tabular-nums', changed && 'border-orange-400 bg-orange-50 font-semibold')}
      />
    );
  };
  const changedCount = items().length;

  return (
    <>
      {hasPending && <Alert tone="info">A request is already with Legal. Sending another change for the same cell or clause replaces it.</Alert>}
      <Card>
        <CardHeader title="Annexure-B rates for this agreement" description="Edit the cells you want to change. Amounts are INR per admitted student." />
        <Table caption="Rate card">
          <thead>
            <tr>
              <TH>Programme group</TH>
              {SLABS.map((s) => (
                <TH key={s} className="text-right">
                  {s}
                </TH>
              ))}
            </tr>
          </thead>
          <tbody>
            {rates.rows.map((r) => (
              <tr key={r.id}>
                <TD>
                  <span className="font-medium">{r.programmeGroup}</span>
                  <span className="block text-xs text-muted">{r.programmes}</span>
                </TD>
                {SLABS.map((s) => (
                  <TD key={s} className="text-right">
                    <div className="flex justify-end">{cell(`${r.id}:${s}`, r.slabs[s])}</div>
                  </TD>
                ))}
              </tr>
            ))}
            {rates.extras.map((x) => (
              <tr key={x.id}>
                <TD>
                  <span className="font-medium">{x.label}</span>
                  <span className="block text-xs text-muted">{x.unit}</span>
                </TD>
                <TD colSpan={4} className="text-right">
                  <div className="flex justify-end">{cell(`extra:${x.id}`, x.amountInr)}</div>
                </TD>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="Clause change" description="Optional. Pick a clause and edit its wording for this agreement only." />
        <CardBody className="space-y-4">
          <Field label="Clause" optional>
            <Select
              value={clauseId}
              onChange={(e) => {
                setClauseId(e.target.value);
                setClauseText(clauses.find((c) => c.id === e.target.value)?.text(detail.institution) ?? '');
              }}
            >
              <option value="">No clause change</option>
              {clauses.map((c, i) => (
                <option key={c.id} value={c.id}>
                  {i + 1}. {c.title}
                </option>
              ))}
            </Select>
          </Field>
          {clauseId && (
            <Field label="Proposed wording" hint="The standard wording is pre-filled. Edit it directly.">
              <Textarea rows={6} value={clauseText} onChange={(e) => setClauseText(e.target.value)} />
            </Field>
          )}
          <Field label="Reason for the deviation" required error={err}>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why does this partner need different terms?" />
          </Field>
        </CardBody>
      </Card>
      <ActionBar>
        <Button icon={<Send className="size-4" />} loading={send.loading} onClick={submit}>
          Send {changedCount ? `${changedCount} change${changedCount === 1 ? '' : 's'} ` : ''}to Legal
        </Button>
      </ActionBar>
    </>
  );
}

function LegalReview({ pending, names }: { pending: Deviation[]; names: Record<string, string> }) {
  if (!pending.length) return <Alert tone="success">No deviations are waiting for your review on this agreement.</Alert>;
  return (
    <Card>
      <CardHeader title="Review requested deviations" description="Adjust the agreed value if needed. Rejecting returns that item to standard terms." />
      <ul className="divide-y divide-line">
        {pending.map((d) => (
          <LegalItem key={d.id} d={d} names={names} />
        ))}
      </ul>
    </Card>
  );
}

function LegalItem({ d, names }: { d: Deviation; names: Record<string, string> }) {
  const [agreed, setAgreed] = useState(d.proposedValue);
  const [comment, setComment] = useState('');
  const approve = useAction(() => api.agreements.decideDeviation(d.id, 'approve', { agreedValue: agreed, comment }), { success: 'Deviation approved' });
  const reject = useAction(() => api.agreements.decideDeviation(d.id, 'reject', { comment }), { success: 'Deviation rejected — standard terms apply' });
  return (
    <li className="space-y-3 px-5 py-4">
      <DeviationCompare deviations={[d]} names={names} />
      <div className="grid gap-3 px-5 sm:grid-cols-2">
        <Field label={d.type === 'rate' ? 'Agreed amount (INR)' : 'Agreed wording'} hint={d.type === 'rate' ? `Standard ${formatInr(Number(d.standardValue))}` : undefined} className={d.type === 'clause' ? 'sm:col-span-2' : ''}>
          {d.type === 'rate' ? <Input type="number" value={agreed} onChange={(e) => setAgreed(e.target.value)} /> : <Textarea rows={5} value={agreed} onChange={(e) => setAgreed(e.target.value)} />}
        </Field>
        <Field label="Comment" hint="Required when rejecting" className={d.type === 'clause' ? 'sm:col-span-2' : ''}>
          <Input value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 px-5">
        <Button variant="danger" size="sm" icon={<X className="size-4" />} loading={reject.loading} onClick={() => void reject.run()}>
          Reject
        </Button>
        <Button variant="success" size="sm" icon={<Check className="size-4" />} loading={approve.loading} onClick={() => void approve.run()}>
          Approve
        </Button>
      </div>
    </li>
  );
}
