import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Lock, Plus, SearchX, Users } from 'lucide-react';
import type { CpType } from '@/types';
import { useSession } from '@/context/SessionContext';
import { api, CP_STATUS_META, type CpStatus } from '@/services/mockApi';
import { useApi } from '@/hooks/useApi';
import { useDebounced, useDocumentTitle, useMediaQuery } from '@/hooks/misc';
import { CP_TYPE_LABELS, CP_TYPES } from '@/lib/format';
import { Badge, ButtonLink, Card, EmptyState, ErrorState, Pagination, PageSkeleton, SearchInput, Select, Table, TD, TH, TR, Toggle } from '@/components/ui';
import { PageHeader } from '@/components/common';

const PAGE = 10;

export function CpList() {
  useDocumentTitle('Channel Partners');
  const { institutionId: headerInst, myInstitutions, can } = useSession();
  const [q, setQ] = useState('');
  const [type, setType] = useState<CpType | ''>('');
  const [status, setStatus] = useState<CpStatus | ''>('');
  const [inst, setInst] = useState('');
  const [warning, setWarning] = useState(false);
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const institutionId = inst || headerInst;
  const { data, error, loading, reload } = useApi(() => api.cps.list({ q: dq, type, status, institutionId: institutionId || undefined, warning }), [dq, type, status, institutionId, warning]);
  const desktop = useMediaQuery('(min-width: 768px)');
  const navigate = useNavigate();
  const filtered = !!(dq || type || status || inst || warning);
  const rows = (data ?? []).slice((page - 1) * PAGE, page * PAGE);
  const reset = () => (setQ(''), setType(''), setStatus(''), setInst(''), setWarning(false), setPage(1));

  return (
    <div>
      <PageHeader
        title="Channel Partners"
        subtitle="Each CP exists once, keyed on PAN, and can hold one active agreement per institution."
        actions={can('agreement.create') ? <ButtonLink to="/agreements/new" icon={<Plus className="size-4" />}>New CP agreement</ButtonLink> : undefined}
      />
      <Card>
        <div className="space-y-3 border-b border-line p-4 sm:p-5">
          <SearchInput label="Search CPs" placeholder="Search by name, PAN or mobile" value={q} onChange={(v) => (setQ(v), setPage(1))} />
          <div className="grid grid-cols-2 gap-3 lg:flex lg:items-center">
            <label className="lg:w-48">
              <span className="sr-only">CP type</span>
              <Select value={type} onChange={(e) => (setType(e.target.value as CpType | ''), setPage(1))}>
                <option value="">All CP types</option>
                {CP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CP_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="lg:w-44">
              <span className="sr-only">Status</span>
              <Select value={status} onChange={(e) => (setStatus(e.target.value as CpStatus | ''), setPage(1))}>
                <option value="">All statuses</option>
                {(Object.keys(CP_STATUS_META) as CpStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {CP_STATUS_META[s].label}
                  </option>
                ))}
              </Select>
            </label>
            {myInstitutions.length > 1 && (
              <label className="lg:w-44">
                <span className="sr-only">Institution</span>
                <Select value={inst} onChange={(e) => (setInst(e.target.value), setPage(1))}>
                  <option value="">All institutions</option>
                  {myInstitutions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.shortCode}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <div className="flex items-center lg:ml-2">
              <Toggle checked={warning} onChange={(v) => (setWarning(v), setPage(1))} label="Warning flag only" />
            </div>
            {filtered && (
              <button type="button" onClick={reset} className="justify-self-start text-sm font-semibold text-primary-700 hover:underline lg:ml-auto">
                Clear filters
              </button>
            )}
          </div>
        </div>

        {loading && !data ? (
          <div className="p-5">
            <PageSkeleton rows={6} />
          </div>
        ) : error && !data ? (
          <div className="p-5">
            <ErrorState error={error} onRetry={reload} />
          </div>
        ) : !data?.length ? (
          filtered ? (
            <EmptyState icon={<SearchX />} title="No CPs match these filters" description="Try a different name or PAN, or clear the filters." action={<button type="button" onClick={reset} className="text-sm font-semibold text-primary-700 hover:underline">Clear filters</button>} />
          ) : (
            <EmptyState icon={<Users />} title="No Channel Partners yet" description="Start a new CP agreement to add your first partner." action={can('agreement.create') ? <ButtonLink to="/agreements/new">New CP agreement</ButtonLink> : undefined} />
          )
        ) : desktop ? (
          <Table caption="Channel Partners">
            <thead>
              <tr>
                <TH>Channel Partner</TH>
                <TH>PAN</TH>
                <TH>Type</TH>
                <TH>Institutions</TH>
                <TH>Status</TH>
                <TH className="w-8">
                  <span className="sr-only">Open</span>
                </TH>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <TR key={c.id} onClick={() => navigate(`/cps/${c.id}`)}>
                  <TD>
                    <Link to={`/cps/${c.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-ink hover:text-primary-700">
                      {c.legalName}
                    </Link>
                    <span className="block text-xs text-muted">
                      {c.id}
                      {c.contactPerson && ` · ${c.contactPerson}`}
                    </span>
                  </TD>
                  <TD className="font-mono text-[13px]">{c.panMasked}</TD>
                  <TD className="text-ink-soft">{c.type ? CP_TYPE_LABELS[c.type] : <span className="inline-flex items-center gap-1 text-xs text-muted"><Lock className="size-3" /> Outside scope</span>}</TD>
                  <TD className="text-ink-soft">{c.institutions.join(', ') || '—'}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={CP_STATUS_META[c.status].tone}>{CP_STATUS_META[c.status].label}</Badge>
                      {c.warning && <Badge tone="red" icon={<AlertTriangle className="size-3" aria-hidden />}>Warning</Badge>}
                    </div>
                  </TD>
                  <TD>
                    <ChevronRight className="size-4 text-subtle" aria-hidden />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((c) => (
              <li key={c.id}>
                <Link to={`/cps/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--surface-hover)]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{c.legalName}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      <span className="font-mono">{c.panMasked}</span> · {c.type ? CP_TYPE_LABELS[c.type] : 'Outside scope'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge tone={CP_STATUS_META[c.status].tone}>{CP_STATUS_META[c.status].label}</Badge>
                      {c.warning && <Badge tone="red">Warning</Badge>}
                      {c.institutions.map((i) => (
                        <Badge key={i} tone="grey">{i}</Badge>
                      ))}
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-subtle" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {data && <Pagination page={page} pageSize={PAGE} total={data.length} onChange={setPage} />}
      </Card>
    </div>
  );
}
