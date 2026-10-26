import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Plus, Scale, Send, Trash2, Undo2, X } from 'lucide-react';
import { SLABS, type Deviation, type DocumentRecord } from '@/types';
import { api } from '@/services/mockApi';
import type { DeviationRequestItem } from '@/services/api/agreements';
import { useAction, useApi } from '@/hooks/useApi';
import { useDocumentTitle } from '@/hooks/misc';
import { clausesFor, effectiveRates } from '@/lib/agreementTemplate';
import { formatInr } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, Field, Input, PageSkeleton, Select, Table, TD, TH, Textarea } from '@/components/ui';
import { ActionBar, FileDrop, PageHeader } from '@/components/common';
import { DeviationCompare, RequestSummary, sharedRequest } from '@/components/agreement';

export function DeviationPanel() {
  const { id = '' } = useParams();
  const { data, error, loading, reload } = useApi(() => api.agreements.get(id), [id]);
  useDocumentTitle(`Deviation ${id}`);
  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const d = data!;
  const pending = d.deviations.filter((x) => x.status === 'pending');
  const decided = d.deviations.filter((x) => x.status !== 'pending');

  return (
    <div>
      <PageHeader
        title="Deviation panel"
        subtitle={`${d.cp.legalName} · ${d.institution.shortCode} · Rate card v${d.rateCard.version}. Changes apply to this agreement only — the master template and rate card are never edited.`}
        badges={d.agreement.nonStandard ? <Badge tone="orange">Non-standard</Badge> : <Badge tone="grey">Standard terms</Badge>}
      />
      <div className="space-y-6">
        {d.actions.decideDeviation && <LegalReview pending={pending} names={d.names} docs={d.documents} />}
        {d.actions.requestDeviation && <RequestForm detail={d} hasPending={pending.length > 0} />}
        {!d.actions.decideDeviation && !d.actions.requestDeviation && (
          <Alert tone={d.agreement.status === 'draft' && !pending.length && decided.length ? 'success' : 'info'}>
            {d.agreement.status !== 'draft'
              ? 'Deviations can only be requested or decided while the agreement is a draft.'
              : !pending.length && decided.length
                ? 'Every deviation on this agreement has been decided. Nothing is waiting for Legal.'
                : 'You can view deviations here. BD Executives request them and Legal decides.'}
          </Alert>
        )}
        {!d.actions.decideDeviation && pending.length > 0 && (
          <Card>
            <CardHeader title="Awaiting Legal" />
            <DeviationCompare deviations={pending} names={d.names} docs={d.documents} />
          </Card>
        )}
        <Card>
          <CardHeader title="Decided deviations" />
          {decided.length ? <DeviationCompare deviations={decided} names={d.names} docs={d.documents} /> : <EmptyState compact icon={<Scale />} title="No decided deviations" description="Legal decisions will be listed here with who approved them." />}
        </Card>
      </div>
    </div>
  );
}

interface ClauseChange {
  key: number;
  clauseId: string;
  text: string;
  reason: string;
  files: File[];
}

const SUPPORT_HINT = 'Optional. e.g. a competing offer, partner email or approval note · PDF, JPG, PNG or DOCX, max 10 MB each';
const SUPPORT_ACCEPT = 'application/pdf,image/*,.docx';

function RequestForm({ detail, hasPending }: { detail: Awaited<ReturnType<typeof api.agreements.get>>; hasPending: boolean }) {
  const navigate = useNavigate();
  const rates = useMemo(() => effectiveRates(detail.rateCard, detail.deviations), [detail]);
  const clauses = clausesFor(detail.institution, detail.template);
  const [cells, setCells] = useState<Record<string, string>>({});
  const [rateReason, setRateReason] = useState('');
  const [rateFiles, setRateFiles] = useState<File[]>([]);
  const [changes, setChanges] = useState<ClauseChange[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [tried, setTried] = useState(false);
  const send = useAction(
    (items: DeviationRequestItem[], r: string, files: File[]) =>
      api.agreements.requestDeviation(
        detail.agreement.id,
        items,
        r,
        files.map((f) => ({ file: f, name: f.name })),
      ),
    {
      success: 'Deviation sent to Legal',
      onSuccess: () => navigate(`/agreements/${detail.agreement.id}/preview`),
    },
  );

  const standardText = (clauseId: string) => clauses.find((c) => c.id === clauseId)?.text(detail.institution) ?? '';
  const rateItems = (): DeviationRequestItem[] =>
    Object.entries(cells)
      .filter(([, v]) => v !== '')
      .map(([ref, v]) => ({ type: 'rate', ref, proposedValue: v }));
  const clauseItems = (): DeviationRequestItem[] =>
    changes
      .filter((c) => c.clauseId && c.text.trim() && c.text.trim() !== standardText(c.clauseId))
      .map((c) => ({ type: 'clause', ref: c.clauseId, proposedValue: c.text, reason: c.reason, files: c.files.map((f) => ({ file: f, name: f.name })) }));

  const update = (key: number, patch: Partial<ClauseChange>) => setChanges((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const addChange = () => {
    setChanges((list) => [...list, { key: nextKey, clauseId: '', text: '', reason: '', files: [] }]);
    setNextKey((k) => k + 1);
  };

  // Errors show after the first send attempt and then follow the user's edits.
  const validate = () => {
    const rItems = rateItems();
    const e: Record<string, string> = {};
    if (rItems.length && rateReason.trim().length < 5) e.rates = 'Give a reason Legal can assess (at least 5 characters).';
    const used = new Set<string>();
    for (const c of changes) {
      if (!c.clauseId) {
        e[`c${c.key}`] = 'Pick a clause, or remove this change.';
        continue;
      }
      if (used.has(c.clauseId)) e[`c${c.key}`] = 'This clause is already changed above. Put both edits in one change.';
      used.add(c.clauseId);
      if (c.text.trim() === standardText(c.clauseId)) e[`c${c.key}`] = 'The wording is unchanged. Edit it, or remove this change.';
      else if (c.text.trim().length < 20) e[`c${c.key}`] = 'The proposed wording is too short.';
      if (c.reason.trim().length < 5) e[`r${c.key}`] = 'Give a reason Legal can assess (at least 5 characters).';
    }
    if (!rItems.length && !changes.length) e.form = 'Change at least one rate cell, or add a clause change.';
    return e;
  };
  const errs = tried ? validate() : {};
  const submit = () => {
    setTried(true);
    if (Object.keys(validate()).length) return;
    const rItems = rateItems();
    void send.run([...rItems, ...clauseItems()], rateReason, rItems.length ? rateFiles : []);
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
  const rateCount = rateItems().length;
  const changedCount = rateCount + clauseItems().length;
  const taken = (key: number) => new Set(changes.filter((c) => c.key !== key).map((c) => c.clauseId));

  return (
    <>
      {hasPending && <Alert tone="info">A request is already with Legal. Sending another change for the same cell or clause replaces it.</Alert>}
      {errs.form && <Alert tone="warning">{errs.form}</Alert>}
      <Card>
        <CardHeader title="Annexure-B rates for this agreement" description="Edit the cells you want to change. Amounts are INR per admitted student." />
        <Table caption="Rate card">
          <thead>
            <tr>
              <TH>Programme group</TH>
              {SLABS.map((s) => (
                <TH key={s} className="whitespace-nowrap text-right">
                  {s}
                </TH>
              ))}
            </tr>
          </thead>
          <tbody>
            {rates.rows.map((r) => (
              <tr key={r.id}>
                <TD className="min-w-[10rem]">
                  <span className="font-medium">{r.programmeGroup}</span>
                  <span className="block text-xs text-muted">{r.programmes}</span>
                </TD>
                {SLABS.map((s) => (
                  <TD key={s} className="text-right">
                    {/* Fixed width, so on phones the table scrolls sideways instead of squeezing the amounts. */}
                    <div className="flex min-w-28 justify-end">{cell(`${r.id}:${s}`, r.slabs[s])}</div>
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
        {rateCount > 0 && (
          <CardBody className="space-y-4 border-t border-line">
            <Field label={`Reason for the rate change${rateCount === 1 ? '' : 's'}`} required error={errs.rates} hint={`Applies to the ${rateCount} changed cell${rateCount === 1 ? '' : 's'}.`}>
              <Textarea rows={3} value={rateReason} onChange={(e) => setRateReason(e.target.value)} placeholder="Why does this partner need different rates?" />
            </Field>
            <FileDrop
              label="Supporting documents"
              hint={SUPPORT_HINT}
              accept={SUPPORT_ACCEPT}
              multiple
              camera={false}
              files={rateFiles}
              onFiles={(f) => setRateFiles((l) => [...l, ...f])}
              onRemove={(i) => setRateFiles((l) => l.filter((_, j) => j !== i))}
            />
          </CardBody>
        )}
      </Card>
      <Card>
        <CardHeader
          title="Clause changes"
          description="Optional. Change the wording of one or more clauses for this agreement only. Each change has its own reason and documents."
          action={
            changes.length > 0 ? (
              <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={addChange} disabled={changes.length >= clauses.length}>
                Add clause change
              </Button>
            ) : undefined
          }
        />
        {changes.length === 0 ? (
          <CardBody>
            <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-line-strong bg-canvas/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted">No clause changes. Standard wording applies to every clause.</p>
              <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={addChange}>
                Add clause change
              </Button>
            </div>
          </CardBody>
        ) : (
          <ol className="divide-y divide-line">
            {changes.map((c, n) => (
              <li key={c.key} className="space-y-4 px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">Clause change {n + 1}</p>
                  <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => setChanges((list) => list.filter((x) => x.key !== c.key))}>
                    Remove
                  </Button>
                </div>
                <Field label="Clause" required error={errs[`c${c.key}`]}>
                  <Select value={c.clauseId} onChange={(e) => update(c.key, { clauseId: e.target.value, text: standardText(e.target.value) })}>
                    <option value="">Choose a clause</option>
                    {clauses.map((cl, i) => (
                      <option key={cl.id} value={cl.id} disabled={taken(c.key).has(cl.id)}>
                        {i + 1}. {cl.title}
                      </option>
                    ))}
                  </Select>
                </Field>
                {c.clauseId && (
                  <Field label="Proposed wording" hint="The standard wording is pre-filled. Edit it directly.">
                    <Textarea rows={6} value={c.text} onChange={(e) => update(c.key, { text: e.target.value })} />
                  </Field>
                )}
                <Field label="Reason for this change" required error={errs[`r${c.key}`]}>
                  <Textarea rows={3} value={c.reason} onChange={(e) => update(c.key, { reason: e.target.value })} placeholder="Why does this partner need different wording?" />
                </Field>
                <FileDrop
                  label="Supporting documents"
                  hint={SUPPORT_HINT}
                  accept={SUPPORT_ACCEPT}
                  multiple
                  camera={false}
                  files={c.files}
                  onFiles={(f) => update(c.key, { files: [...c.files, ...f] })}
                  onRemove={(i) => update(c.key, { files: c.files.filter((_, j) => j !== i) })}
                />
              </li>
            ))}
          </ol>
        )}
      </Card>
      <ActionBar>
        <Button icon={<Send className="size-4" />} loading={send.loading} onClick={submit}>
          Send {changedCount ? `${changedCount} change${changedCount === 1 ? '' : 's'} ` : ''}to Legal
        </Button>
      </ActionBar>
    </>
  );
}

function LegalReview({ pending, names, docs }: { pending: Deviation[]; names: Record<string, string>; docs: DocumentRecord[] }) {
  const [agreed, setAgreed] = useState<Record<string, string>>({});
  const [rejected, setRejected] = useState<Record<string, boolean>>({});
  const [comment, setComment] = useState('');
  const [tried, setTried] = useState(false);
  const agreementId = pending[0]?.agreementId ?? '';
  const rejects = pending.filter((d) => rejected[d.id]).length;
  const approves = pending.length - rejects;
  const decide = useAction(
    () =>
      api.agreements.decideDeviations(
        agreementId,
        pending.map((d) => ({ id: d.id, decision: rejected[d.id] ? 'reject' : 'approve', agreedValue: agreed[d.id] ?? d.proposedValue })),
        comment,
      ),
    { success: rejects === 0 ? `${pending.length === 1 ? 'Deviation' : 'All deviations'} approved` : approves === 0 ? 'Deviations rejected — standard terms apply' : 'Decision sent to the BD Executive' },
  );
  if (!pending.length) return <Alert tone="success">No deviations are waiting for your review on this agreement.</Alert>;
  const commentError = tried && rejects > 0 && !comment.trim() ? 'Say why, so the BD Executive knows what to change.' : undefined;
  const submit = () => {
    setTried(true);
    if (rejects > 0 && !comment.trim()) return;
    void decide.run();
  };
  const shared = sharedRequest(pending);
  const label = rejects === 0 ? (pending.length === 1 ? 'Approve' : `Approve all ${pending.length}`) : approves === 0 ? `Reject ${pending.length === 1 ? '' : `all ${pending.length}`}`.trim() : `Approve ${approves}, reject ${rejects}`;
  return (
    <Card>
      <CardHeader
        title="Review requested deviations"
        description={`${pending.length} change${pending.length === 1 ? '' : 's'} in this request, decided together. Adjust an agreed value if needed, or mark an item to reject — it returns to standard terms.`}
      />
      <RequestSummary deviations={pending} names={names} docs={docs} />
      <ul className="divide-y divide-line">
        {pending.map((d) => (
          <li key={d.id} className={cn('space-y-3 pb-4', rejected[d.id] && 'bg-red-50/40')}>
            <DeviationCompare deviations={[d]} names={names} docs={docs} shared={shared} />
            <div className="grid items-end gap-3 px-5 sm:grid-cols-[1fr_auto]">
              <Field label={d.type === 'rate' ? 'Agreed amount (INR)' : 'Agreed wording'} hint={d.type === 'rate' ? `Standard ${formatInr(Number(d.standardValue))}` : undefined}>
                {d.type === 'rate' ? (
                  <Input type="number" value={agreed[d.id] ?? d.proposedValue} disabled={rejected[d.id]} onChange={(e) => setAgreed((m) => ({ ...m, [d.id]: e.target.value }))} />
                ) : (
                  <Textarea rows={5} value={agreed[d.id] ?? d.proposedValue} disabled={rejected[d.id]} onChange={(e) => setAgreed((m) => ({ ...m, [d.id]: e.target.value }))} />
                )}
              </Field>
              <div className={cn('flex', d.type === 'rate' && 'sm:mb-6')}>
                <Button
                  variant={rejected[d.id] ? 'danger' : 'secondary'}
                  size="sm"
                  icon={rejected[d.id] ? <Undo2 className="size-4" /> : <X className="size-4" />}
                  aria-pressed={!!rejected[d.id]}
                  onClick={() => setRejected((m) => ({ ...m, [d.id]: !m[d.id] }))}
                >
                  {rejected[d.id] ? 'Rejected — undo' : 'Reject this item'}
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <CardBody className="space-y-4 border-t border-line">
        <Field label="Comment" required={rejects > 0} error={commentError} hint={rejects > 0 ? 'Required when rejecting an item. Sent to the BD Executive.' : 'Optional. Sent to the BD Executive.'}>
          <Input value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Button variant={approves === 0 ? 'danger' : 'success'} icon={approves === 0 ? <X className="size-4" /> : <Check className="size-4" />} loading={decide.loading} onClick={submit}>
            {label}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
