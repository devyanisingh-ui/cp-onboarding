'use client';

import { useState } from 'react';
import { Coins, GraduationCap, Pencil, RefreshCcw, Send, Users } from 'lucide-react';
import type { LeadStatus } from '@/types';
import { api, LEAD_STATUS_LABELS, type CpLeadsView } from '@/services/mockApi';
import { useAction, useApi } from '@/hooks/useApi';
import { formatDate, formatDateTime } from '@/lib/dates';
import { formatInr } from '@/lib/format';
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, Field, Input, Modal, PageSkeleton, Select, StatTile, Table, TD, TH, Textarea } from '@/components/ui';

const STATUS_TONE: Record<LeadStatus, 'grey' | 'blue' | 'green' | 'red'> = { lead: 'grey', applied: 'blue', admitted: 'green', dropped: 'red' };

/** CP page → Leads & revenue: what the CP brought in, from the CRM, per institution. Admin corrects. */
export function CpLeadsTab({ cpId }: { cpId: string }) {
  const [year, setYear] = useState('');
  const { data, error, loading, reload } = useApi(() => api.leads.forCp(cpId, year || undefined), [cpId, year]);
  const [editing, setEditing] = useState<CpLeadsView['leads'][number] | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);

  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const v = data!;
  const t = v.totals;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted">
          From the CRM ({v.sync?.connector ?? 'not synced yet'}) · partner code <span className="font-mono text-ink">{v.partnerCode}</span>
          {v.sync?.lastSyncAt && ` · synced ${formatDateTime(v.sync.lastSyncAt)}`}
          {v.canEdit && (
            <button type="button" className="hit-area ml-2 font-medium text-primary-700 hover:underline" onClick={() => setCodeOpen(true)}>
              Change code
            </button>
          )}
        </p>
        {v.years.length > 1 && (
          <Field label="Admission cycle" className="w-44">
            <Select value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">All cycles</option>
              {v.years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      {t.leads === 0 ? (
        <Card>
          <EmptyState
            compact
            icon={<Users />}
            title="No leads yet"
            description={`The CRM has no leads under partner code ${v.partnerCode}${year ? ` for ${year}` : ''}. Leads appear after the next sync (hourly), or Admin can sync now from Admin → System.`}
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Leads" value={t.leads} icon={<Users />} tone="accent" />
            <StatTile label="Applications" value={t.applications} icon={<Send />} tone="blue" />
            <StatTile label="Admissions" value={t.admissions} hint={`${t.conversion}% of leads`} icon={<GraduationCap />} tone="green" />
            <StatTile label="Revenue" value={formatInr(t.revenueInr)} hint="Fees of admitted students" icon={<Coins />} tone="amber" />
          </div>

          <Card>
            <CardHeader title="By institution" description="Leads → applications → admissions, and the fees admitted students bring." />
            <Table caption="Leads and revenue by institution">
              <thead>
                <tr>
                  <TH>Institution</TH>
                  <TH className="text-right">Leads</TH>
                  <TH className="text-right">Applications</TH>
                  <TH className="text-right">Admissions</TH>
                  <TH className="text-right">Conversion</TH>
                  <TH className="text-right">Revenue</TH>
                </tr>
              </thead>
              <tbody>
                {v.byInstitution.map((i) => (
                  <tr key={i.institutionId}>
                    <TD className="font-medium">{i.institutionCode}</TD>
                    <TD className="text-right tabular-nums">{i.leads}</TD>
                    <TD className="text-right tabular-nums">{i.applications}</TD>
                    <TD className="text-right tabular-nums">{i.admissions}</TD>
                    <TD className="text-right tabular-nums">{i.conversion}%</TD>
                    <TD className="text-right tabular-nums">{formatInr(i.revenueInr)}</TD>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Leads" description="As the CRM reports them. Students' personal details stay in the CRM; this shows its lead ID only." />
            <Table caption="Leads">
              <thead>
                <tr>
                  <TH>CRM lead ID</TH>
                  <TH>Institution</TH>
                  <TH>Programme</TH>
                  <TH>Status</TH>
                  <TH>Lead on</TH>
                  <TH className="text-right">Fee</TH>
                  {v.canEdit && <TH className="w-px" />}
                </tr>
              </thead>
              <tbody>
                {v.leads.map((l) => (
                  <tr key={l.id}>
                    <TD className="font-mono text-[13px]">{l.crmId}</TD>
                    <TD>{l.institutionCode}</TD>
                    <TD>
                      {l.programme}
                      <span className="block text-xs text-muted">{l.academicYear}</span>
                    </TD>
                    <TD>
                      <Badge tone={STATUS_TONE[l.effectiveStatus]}>{LEAD_STATUS_LABELS[l.effectiveStatus]}</Badge>
                      {l.correction && (
                        <span className="mt-1 block text-xs text-muted" title={l.correction.note}>
                          Corrected by Admin (CRM: {LEAD_STATUS_LABELS[l.status]})
                        </span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap">{formatDate(l.createdOn)}</TD>
                    <TD className="text-right tabular-nums">{l.effectiveFeeInr ? formatInr(l.effectiveFeeInr) : '—'}</TD>
                    {v.canEdit && (
                      <TD>
                        <Button variant="ghost" size="sm" icon={<Pencil className="size-4" />} onClick={() => setEditing(l)} aria-label={`Correct lead ${l.crmId}`}>
                          Correct
                        </Button>
                      </TD>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}

      {editing && <CorrectLeadModal lead={editing} onClose={() => setEditing(null)} />}
      {codeOpen && <PartnerCodeModal cpId={cpId} current={v.partnerCode} onClose={() => setCodeOpen(false)} />}
    </div>
  );
}

function CorrectLeadModal({ lead, onClose }: { lead: CpLeadsView['leads'][number]; onClose: () => void }) {
  const [status, setStatus] = useState<LeadStatus>(lead.effectiveStatus);
  const [fee, setFee] = useState(lead.effectiveFeeInr ? String(lead.effectiveFeeInr) : '');
  const [note, setNote] = useState(lead.correction?.note ?? '');
  const save = useAction(() => api.leads.correct(lead.id, { status, feeInr: status === 'admitted' ? Number(fee) : undefined, note }), { success: 'Lead corrected', onSuccess: onClose });
  const clear = useAction(() => api.leads.correct(lead.id, null), { success: 'Correction removed — the CRM’s values apply', onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Correct lead ${lead.crmId}`}
      footer={
        <>
          {lead.correction && (
            <Button variant="ghost" loading={clear.loading} onClick={() => void clear.run()}>
              Use the CRM’s values
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.loading} onClick={() => void save.run()}>
            Save correction
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert tone="info">
          The CRM says <strong>{LEAD_STATUS_LABELS[lead.status]}</strong>
          {lead.feeInr ? `, fee ${formatInr(lead.feeInr)}` : ''}. Your correction is kept across syncs until you remove it.
        </Alert>
        <Field label="Status" required>
          <Select value={status} onChange={(e) => setStatus(e.target.value as LeadStatus)}>
            {(Object.keys(LEAD_STATUS_LABELS) as LeadStatus[]).map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        {status === 'admitted' && (
          <Field label="Fee (INR)" required error={save.fieldErrors.feeInr}>
            <Input type="number" min={0} step={1000} value={fee} onChange={(e) => setFee(e.target.value)} />
          </Field>
        )}
        <Field label="Why the CRM value is wrong" required error={save.fieldErrors.note}>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Admitted on 20 Oct; the CRM has not been updated yet" />
        </Field>
      </div>
    </Modal>
  );
}

function PartnerCodeModal({ cpId, current, onClose }: { cpId: string; current: string; onClose: () => void }) {
  const [code, setCode] = useState(current === cpId ? '' : current);
  const save = useAction(() => api.leads.setPartnerCode(cpId, code), { success: 'CRM partner code saved. Leads under it appear after the next sync.', onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title="CRM partner code"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.loading} onClick={() => void save.run()}>
            Save
          </Button>
        </>
      }
    >
      <CardBody className="space-y-3 p-0">
        <p className="text-sm text-muted">The code the CRM uses for this partner. Leads are matched to the CP by it. Leave it empty to use the CP ID ({cpId}).</p>
        <Field label="Partner code in the CRM" error={save.fieldErrors.code}>
          <Input value={code} onChange={(e) => setCode(e.target.value)} className="font-mono" placeholder={cpId} />
        </Field>
      </CardBody>
    </Modal>
  );
}

/** Admin → System: the CRM connection and a manual sync. */
export function CrmSyncCard() {
  const status = useApi(() => api.leads.status(), []);
  const sync = useAction(() => api.leads.syncNow(), {
    success: (r) => (r.error ? `Sync failed: ${r.error}` : `Synced: ${r.created} new, ${r.updated} updated${r.unmatched ? `, ${r.unmatched} not matched to a CP` : ''}`),
    onSuccess: () => status.reload(),
  });
  const s = status.data;
  return (
    <Card>
      <CardHeader
        title="CRM leads sync"
        description="Leads and revenue per CP are pulled from the CRM every hour. Until the real CRM is connected, a demo CRM supplies sample leads."
        icon={<RefreshCcw />}
        action={
          <Button variant="secondary" size="sm" icon={<RefreshCcw className="size-4" />} loading={sync.loading} onClick={() => void sync.run()}>
            Sync now
          </Button>
        }
      />
      <CardBody className="text-sm">
        {s ? (
          <p>
            <span className="font-medium">{s.connector}</span> · {s.leads} lead{s.leads === 1 ? '' : 's'} stored
            {s.lastSyncAt ? ` · last sync ${formatDateTime(s.lastSyncAt)}` : ' · not synced yet'}
            {s.lastResult && !s.lastResult.error && ` (${s.lastResult.fetched} fetched, ${s.lastResult.created} new, ${s.lastResult.updated} updated, ${s.lastResult.unmatched} not matched to a CP)`}
            {s.lastResult?.error && <span className="block text-danger-700">Last sync failed: {s.lastResult.error}</span>}
          </p>
        ) : (
          <p className="text-muted">Loading…</p>
        )}
      </CardBody>
    </Card>
  );
}
