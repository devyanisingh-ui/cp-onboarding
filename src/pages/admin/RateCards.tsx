import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Plus, Save, Send, Trash2, Upload, X } from 'lucide-react';
import { SLABS, type RateCard } from '@/types';
import { api } from '@/services/mockApi';
import { useAction, useApi } from '@/hooks/useApi';
import { useSession } from '@/context/SessionContext';
import { useDocumentTitle } from '@/hooks/misc';
import { formatDate } from '@/lib/dates';
import { formatInr } from '@/lib/format';
import { VERSION_STATUS_META } from '@/lib/status';
import { cn } from '@/lib/cn';
import { Alert, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, IconButton, Input, PageSkeleton, RadioGroup, Select, Table, TD, TH, Textarea } from '@/components/ui';
import { CommentDialog } from '@/components/common';

export function RateCards() {
  useDocumentTitle('Rate cards');
  const { can, user, myInstitutions } = useSession();
  const [params, setParams] = useSearchParams();
  const lookups = useApi(() => api.config.lookups(), []);
  const { data, error, loading, reload } = useApi(() => api.config.rateCards(), []);
  const selectedId = params.get('id');
  const selected = data?.find((r) => r.id === selectedId);
  const [inst, setInst] = useState('');
  const institutionId = selected?.institutionId ?? (inst || myInstitutions[0]?.id || '');
  const [rejecting, setRejecting] = useState(false);
  const create = useAction(() => api.config.createRateCard(institutionId), { success: 'Draft version created', onSuccess: (rc) => setParams({ id: rc.id }) });
  const submit = useAction((id: string) => api.config.submitRateCard(id), { success: 'Sent to Legal for approval' });
  const approve = useAction((id: string) => api.config.decideRateCard(id, 'approve'), { success: 'Approved — Admin can now publish' });
  const reject = useAction((id: string, c: string) => api.config.decideRateCard(id, 'reject', c), { success: 'Returned to Admin' });
  const publish = useAction((id: string) => api.config.publishRateCard(id), {
    success: (r) => `Published${r.flagged ? ` — ${r.flagged} agreement(s) flagged for review` : ''}`,
  });

  if ((loading && !data) || lookups.loading) return <PageSkeleton />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const versions = data!.filter((r) => r.institutionId === institutionId);
  const current = selected ?? versions.find((v) => v.status === 'pending_approval' || v.status === 'draft' || v.status === 'approved') ?? versions.find((v) => v.status === 'published');
  const names = Object.fromEntries((lookups.data?.users ?? []).map((u) => [u.id, u.name]));
  const instName = lookups.data?.institutions.find((i) => i.id === institutionId)?.shortCode ?? '';

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Field label="Institution" className="sm:w-72">
          <Select
            value={institutionId}
            onChange={(e) => {
              setInst(e.target.value);
              setParams({});
            }}
          >
            {myInstitutions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.shortCode} · {i.legalName}
              </option>
            ))}
          </Select>
        </Field>
        {can('ratecard.manage') && (
          <Button icon={<Plus className="size-4" />} loading={create.loading} onClick={() => void create.run()}>
            New version
          </Button>
        )}
      </div>

      <Card>
        <CardHeader title={`${instName} versions`} description="Published versions are never edited. Admin creates, Legal approves, Admin publishes." />
        <ul className="divide-y divide-line">
          {versions.map((v) => (
            <li key={v.id}>
              <button type="button" onClick={() => setParams({ id: v.id })} className={cn('flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-[var(--surface-hover)]', current?.id === v.id && 'bg-primary-50/50')}>
                <span className="w-10 font-semibold">v{v.version}</span>
                <Badge tone={VERSION_STATUS_META[v.status].tone}>{VERSION_STATUS_META[v.status].label}</Badge>
                <span className="flex-1 text-sm text-muted">Effective {formatDate(v.effectiveFrom)}</span>
                <span className="hidden text-xs text-subtle sm:inline">{v.applyMode === 'new_only' ? 'New agreements only' : 'Issue addendums'}</span>
              </button>
            </li>
          ))}
        </ul>
        {!versions.length && <EmptyState compact title="No rate cards yet" description="Create the first version for this institution." />}
      </Card>

      {current && (
        <VersionEditor
          key={current.id + current.status}
          rc={current}
          names={names}
          editable={current.status === 'draft' && can('ratecard.manage')}
          actions={
            <>
              {current.status === 'draft' && can('ratecard.manage') && (
                <Button icon={<Send className="size-4" />} loading={submit.loading} onClick={() => void submit.run(current.id)}>
                  Send to Legal
                </Button>
              )}
              {current.status === 'pending_approval' && can('ratecard.approve') && (
                <>
                  <Button variant="danger" icon={<X className="size-4" />} onClick={() => setRejecting(true)}>
                    Return
                  </Button>
                  <Button variant="success" icon={<Check className="size-4" />} loading={approve.loading} disabled={current.createdById === user?.id} onClick={() => void approve.run(current.id)}>
                    Approve
                  </Button>
                </>
              )}
              {current.status === 'approved' && can('ratecard.manage') && (
                <Button icon={<Upload className="size-4" />} loading={publish.loading} onClick={() => void publish.run(current.id)}>
                  Publish
                </Button>
              )}
              {current.status === 'pending_approval' && can('ratecard.manage') && <p className="self-center text-sm text-muted">Waiting for Legal. You can’t publish until it’s approved.</p>}
            </>
          }
        />
      )}
      <CommentDialog open={rejecting} onClose={() => setRejecting(false)} title="Return rate card to Admin" confirmLabel="Return" onConfirm={async (c) => (await reject.run(current!.id, c)).ok} />
    </div>
  );
}

function VersionEditor({ rc, names, editable, actions }: { rc: RateCard; names: Record<string, string>; editable: boolean; actions: ReactNode }) {
  const [v, setV] = useState(rc);
  const save = useAction(() => api.config.saveRateCard(v), { success: 'Draft saved' });
  const cellCls = 'h-9 w-24 text-right tabular-nums';
  return (
    <Card>
      <CardHeader
        title={`Version ${rc.version}`}
        description={`Created by ${names[rc.createdById] ?? '—'}${rc.approvedById ? ` · approved by ${names[rc.approvedById]}` : ''}${rc.publishedById ? ` · published by ${names[rc.publishedById]}` : ''}`}
        action={<Badge tone={VERSION_STATUS_META[rc.status].tone}>{VERSION_STATUS_META[rc.status].label}</Badge>}
      />
      <div className="space-y-5 p-5">
        {rc.rejectComment && rc.status === 'draft' && <Alert tone="error" title="Returned by Legal">{rc.rejectComment}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Effective from">
            <Input type="date" value={v.effectiveFrom} disabled={!editable} onChange={(e) => setV({ ...v, effectiveFrom: e.target.value })} />
          </Field>
          <Field label="Notes" optional>
            <Input value={v.notes ?? ''} disabled={!editable} onChange={(e) => setV({ ...v, notes: e.target.value })} />
          </Field>
        </div>
        <RadioGroup
          name={`apply-${rc.id}`}
          legend="Apply mode"
          layout="cards"
          value={v.applyMode}
          onChange={(m) => editable && setV({ ...v, applyMode: m })}
          options={[
            { value: 'new_only', label: 'New agreements only', description: 'Default. Existing agreements keep their rates.', disabled: !editable },
            { value: 'addendums', label: 'Issue addendums to existing CPs', description: 'Affected agreements are listed; bulk addendums arrive in phase 2.', disabled: !editable },
          ]}
        />
      </div>
      <Table caption="Rate rows">
        <thead>
          <tr>
            <TH>Programme group</TH>
            <TH>Programmes</TH>
            {SLABS.map((s) => (
              <TH key={s} className="text-right">
                {s}
              </TH>
            ))}
            {editable && <TH><span className="sr-only">Remove</span></TH>}
          </tr>
        </thead>
        <tbody>
          {v.rows.map((r, i) => (
            <tr key={r.id}>
              <TD>{editable ? <Input className="h-9 min-w-36" aria-label="Programme group" value={r.programmeGroup} onChange={(e) => setV({ ...v, rows: v.rows.map((x, j) => (j === i ? { ...x, programmeGroup: e.target.value } : x)) })} /> : <span className="font-medium">{r.programmeGroup}</span>}</TD>
              <TD className="text-sm text-muted">{editable ? <Input className="h-9 min-w-44" aria-label="Programmes" value={r.programmes} onChange={(e) => setV({ ...v, rows: v.rows.map((x, j) => (j === i ? { ...x, programmes: e.target.value } : x)) })} /> : r.programmes}</TD>
              {SLABS.map((s) => (
                <TD key={s} className="text-right tabular-nums">
                  {editable ? (
                    <Input type="number" className={cellCls} aria-label={`${r.programmeGroup} ${s}`} value={r.slabs[s]} onChange={(e) => setV({ ...v, rows: v.rows.map((x, j) => (j === i ? { ...x, slabs: { ...x.slabs, [s]: Number(e.target.value) } } : x)) })} />
                  ) : (
                    formatInr(r.slabs[s])
                  )}
                </TD>
              ))}
              {editable && (
                <TD>
                  <IconButton label="Remove row" size="sm" onClick={() => setV({ ...v, rows: v.rows.filter((_, j) => j !== i) })}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </TD>
              )}
            </tr>
          ))}
        </tbody>
      </Table>
      <div className="space-y-3 border-t border-line p-5">
        {editable && (
          <Button variant="link" size="sm" icon={<Plus className="size-4" />} onClick={() => setV({ ...v, rows: [...v.rows, { id: `r-${Date.now()}`, programmeGroup: '', programmes: '', slabs: { '1-10': 0, '11-15': 0, '16-20': 0, '21+': 0 } }] })}>
            Add row
          </Button>
        )}
        <p className="text-sm font-semibold">Extras</p>
        {v.extras.length === 0 && <p className="text-sm text-muted">No extras.</p>}
        {v.extras.map((x, i) => (
          <div key={x.id} className="flex flex-wrap items-center gap-2 text-sm">
            {editable ? (
              <>
                <Input className="h-9 w-48" aria-label="Extra label" value={x.label} onChange={(e) => setV({ ...v, extras: v.extras.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)) })} />
                <Input type="number" className="h-9 w-28" aria-label="Amount" value={x.amountInr} onChange={(e) => setV({ ...v, extras: v.extras.map((y, j) => (j === i ? { ...y, amountInr: Number(e.target.value) } : y)) })} />
                <Input className="h-9 min-w-48 flex-1" aria-label="Unit" value={x.unit} onChange={(e) => setV({ ...v, extras: v.extras.map((y, j) => (j === i ? { ...y, unit: e.target.value } : y)) })} />
              </>
            ) : (
              <span>
                {x.label}: <strong>{formatInr(x.amountInr)}</strong> {x.unit}
              </span>
            )}
          </div>
        ))}
        {editable && (
          <Button variant="link" size="sm" icon={<Plus className="size-4" />} onClick={() => setV({ ...v, extras: [...v.extras, { id: `x-${Date.now()}`, label: '', amountInr: 0, unit: 'per student' }] })}>
            Add extra
          </Button>
        )}
        {rc.affectedAgreementIds && rc.affectedAgreementIds.length > 0 && (
          <Alert tone="info" title="Addendums to issue (phase 2)">
            {rc.affectedAgreementIds.join(', ')}
          </Alert>
        )}
        {rc.notes && !editable && <Textarea readOnly value={rc.notes} rows={2} aria-label="Notes" />}
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          {editable && (
            <Button variant="secondary" icon={<Save className="size-4" />} loading={save.loading} onClick={() => void save.run()}>
              Save draft
            </Button>
          )}
          {actions}
        </div>
      </div>
    </Card>
  );
}
