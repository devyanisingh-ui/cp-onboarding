import { Fragment, useState } from 'react';
import { ChevronDown, FileSpreadsheet, ScrollText, SearchX } from 'lucide-react';
import type { AuditEvent } from '@/types';
import { api } from '@/services/mockApi';
import { getDb } from '@/services/db';
import { useApi } from '@/hooks/useApi';
import { useDebounced, useDocumentTitle } from '@/hooks/misc';
import { formatDateTime, today } from '@/lib/dates';
import { exportXlsx } from '@/lib/excel';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Pagination, PageSkeleton, SearchInput, Select } from '@/components/ui';
import { PageHeader } from '@/components/common';

const PAGE = 25;
const ACTIONS = ['login', 'logout', 'create', 'update', 'submit', 'approve', 'reject', 'upload', 'view', 'download', 'reveal', 'verify', 'mismatch', 'escalate', 'status_change', 'config_change', 'publish', 'request', 'override', 'renewal_decision', 'terminate_start', 'terminate_confirm', 'warning_flag', 'import', 'delete_blocked', 'pan_check'];
const ENTITIES = ['agreement', 'cp', 'document', 'deviation', 'rate_card', 'template', 'task', 'session', 'user', 'institution', 'routing', 'sla', 'domains', 'master_lists', 'legacy_batch', 'override'];

export function AuditLog() {
  useDocumentTitle('Audit log');
  const [q, setQ] = useState('');
  const [actorId, setActor] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useApi(() => api.inbox.audit({ q: dq, actorId, action, entityType, from, to }), [dq, actorId, action, entityType, from, to]);
  const rows = (data ?? []).slice((page - 1) * PAGE, page * PAGE);
  const users = getDb().users;
  const reset = (fn: () => void) => (fn(), setPage(1));

  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle="Immutable record of every create, edit, approval, upload, reveal, download, sign-in and configuration change."
        actions={
          <Button
            variant="secondary"
            icon={<FileSpreadsheet className="size-4" />}
            disabled={!data?.length}
            onClick={() =>
              void exportXlsx(`Audit_log_${today()}.xlsx`, 'Audit log', (data ?? []).map((e) => ({ at: formatDateTime(e.at), actor: e.actorName, action: e.action, entity: `${e.entityType} ${e.entityId}`, summary: e.summary, before: JSON.stringify(e.before ?? ''), after: JSON.stringify(e.after ?? ''), ip: e.ip, device: e.device })), [
                { key: 'at', label: 'Time' },
                { key: 'actor', label: 'Actor' },
                { key: 'action', label: 'Action' },
                { key: 'entity', label: 'Entity' },
                { key: 'summary', label: 'Summary' },
                { key: 'before', label: 'Before' },
                { key: 'after', label: 'After' },
                { key: 'ip', label: 'IP' },
                { key: 'device', label: 'Device' },
              ])
            }
          >
            Export
          </Button>
        }
      />
      <Card>
        <div className="space-y-3 border-b border-line p-4 sm:p-5">
          <SearchInput label="Search audit log" placeholder="Search summary, entity ID or actor" value={q} onChange={(v) => reset(() => setQ(v))} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Field label="Actor">
              <Select value={actorId} onChange={(e) => reset(() => setActor(e.target.value))}>
                <option value="">Everyone</option>
                <option value="system">System</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Action">
              <Select value={action} onChange={(e) => reset(() => setAction(e.target.value))}>
                <option value="">All actions</option>
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Entity">
              <Select value={entityType} onChange={(e) => reset(() => setEntity(e.target.value))}>
                <option value="">All entities</option>
                {ENTITIES.map((a) => (
                  <option key={a} value={a}>
                    {a.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="From">
              <Input type="date" value={from} onChange={(e) => reset(() => setFrom(e.target.value))} />
            </Field>
            <Field label="To">
              <Input type="date" value={to} onChange={(e) => reset(() => setTo(e.target.value))} />
            </Field>
          </div>
        </div>
        {loading && !data ? (
          <div className="p-5">
            <PageSkeleton />
          </div>
        ) : error && !data ? (
          <div className="p-5">
            <ErrorState error={error} onRetry={reload} />
          </div>
        ) : !rows.length ? (
          <EmptyState icon={data?.length === 0 && !q ? <ScrollText /> : <SearchX />} title="No events match" description="Try widening the date range or clearing filters." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((e) => (
              <Fragment key={e.id}>
                <li>
                  <button type="button" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-[var(--surface-hover)]">
                    <ActionBadge action={e.action} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-ink">{e.summary}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {e.actorName} · {e.entityType.replace(/_/g, ' ')} <span className="font-mono">{e.entityId}</span> · {formatDateTime(e.at)}
                      </span>
                    </span>
                    <ChevronDown className={cn('mt-1 size-4 shrink-0 text-subtle transition-transform', open === e.id && 'rotate-180')} aria-hidden />
                  </button>
                  {open === e.id && <EventDetail e={e} />}
                </li>
              </Fragment>
            ))}
          </ul>
        )}
        {data && <Pagination page={page} pageSize={PAGE} total={data.length} onChange={setPage} />}
      </Card>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const tone = /approve|verify|publish/.test(action) ? 'green' : /reject|mismatch|terminate|warning|blocked/.test(action) ? 'red' : /reveal|download|view/.test(action) ? 'purple' : /escalate/.test(action) ? 'orange' : /config/.test(action) ? 'blue' : 'grey';
  return (
    <Badge tone={tone} className="mt-0.5 w-28 justify-center">
      {action.replace(/_/g, ' ')}
    </Badge>
  );
}

function EventDetail({ e }: { e: AuditEvent }) {
  return (
    <div className="grid gap-3 bg-sunken/40 px-5 pb-4 pt-1 text-xs sm:grid-cols-2">
      <div>
        <p className="mb-1 font-semibold uppercase tracking-wide text-muted">Before</p>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-line bg-white p-2.5 font-mono text-[11px]">{e.before ? JSON.stringify(e.before, null, 2) : '—'}</pre>
      </div>
      <div>
        <p className="mb-1 font-semibold uppercase tracking-wide text-muted">After</p>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-line bg-white p-2.5 font-mono text-[11px]">{e.after ? JSON.stringify(e.after, null, 2) : '—'}</pre>
      </div>
      <p className="text-muted sm:col-span-2">
        Event {e.id} · IP {e.ip} · {e.device}
      </p>
    </div>
  );
}
