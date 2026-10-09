import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { BarChart3, ChevronRight, FileSpreadsheet, SearchX } from 'lucide-react';
import type { CpType } from '@/types';
import { api, type ReportFilters, type ReportId } from '@/services/mockApi';
import { getDb } from '@/services/db';
import { useSession } from '@/context/SessionContext';
import { useApi } from '@/hooks/useApi';
import { useDocumentTitle } from '@/hooks/misc';
import { exportXlsx } from '@/lib/excel';
import { errorMessage } from '@/services/errors';
import { CP_TYPE_LABELS, CP_TYPES } from '@/lib/format';
import { today } from '@/lib/dates';
import { STATUS_META } from '@/lib/status';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageSkeleton, Select, Table, TD, TH, TR, useToast } from '@/components/ui';
import { PageHeader } from '@/components/common';

export function Reports() {
  useDocumentTitle('Reports');
  return (
    <div>
      <PageHeader title="Reports" subtitle="Seven operational reports. Filter by institution, region, CP type, owner and dates, then export to Excel." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {api.reports.list.map((r) => (
          <Link key={r.id} to={`/reports/${r.id}`} className="surface surface-interactive group flex items-start gap-3 rounded-xl p-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
              <BarChart3 className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">{r.title}</span>
              <span className="mt-0.5 block text-sm text-muted">{r.description}</span>
            </span>
            <ChevronRight className="mt-1 size-4 text-subtle group-hover:text-primary-600" aria-hidden />
          </Link>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">Turnaround by stage and person, and rate revision impact, arrive in phase 2.</p>
    </div>
  );
}

export function ReportView() {
  const { reportId = 'by_status' } = useParams();
  const id = reportId as ReportId;
  const meta = api.reports.list.find((r) => r.id === id);
  const navigate = useNavigate();
  const toast = useToast();
  const { myInstitutions } = useSession();
  const [f, setF] = useState<ReportFilters>({});
  const { data, error, loading, reload } = useApi(() => api.reports.run(id, f), [id, JSON.stringify(f)]);
  useDocumentTitle(meta?.title ?? 'Report');
  const db = getDb();
  const owners = db.users.filter((u) => u.roles.includes('bd_exec'));
  const set = (k: keyof ReportFilters, v: string) => setF((x) => ({ ...x, [k]: v || undefined }));
  if (!meta) return <ErrorState error={Object.assign(new Error('That report does not exist.'), { status: 404 })} />;

  const exportIt = async () => {
    if (!data) return;
    try {
      if (await exportXlsx(`${meta.title.replace(/[^a-z0-9]+/gi, '_')}_${today()}.xlsx`, meta.title, data.rows, data.columns)) toast.success('Excel file downloaded');
    } catch (e) {
      toast.error('Download failed', errorMessage(e));
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Reports', to: '/reports' }, { label: meta.title }]}
        title={meta.title}
        subtitle={meta.description}
        actions={
          <Button variant="secondary" icon={<FileSpreadsheet className="size-4" />} onClick={() => void exportIt()} disabled={!data?.rows.length}>
            Export to Excel
          </Button>
        }
      />
      <Card className="mb-5 p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Field label="Institution">
            <Select value={f.institutionId ?? ''} onChange={(e) => set('institutionId', e.target.value)}>
              <option value="">All</option>
              {myInstitutions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.shortCode}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Region">
            <Select value={f.regionId ?? ''} onChange={(e) => set('regionId', e.target.value)}>
              <option value="">All</option>
              {db.regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name.split(' (')[0]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="CP type">
            <Select value={f.cpType ?? ''} onChange={(e) => set('cpType', e.target.value as CpType)}>
              <option value="">All</option>
              {CP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CP_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Owner">
            <Select value={f.ownerId ?? ''} onChange={(e) => set('ownerId', e.target.value)}>
              <option value="">All</option>
              {owners.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From">
            <Input type="date" value={f.from ?? ''} onChange={(e) => set('from', e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={f.to ?? ''} onChange={(e) => set('to', e.target.value)} />
          </Field>
        </div>
      </Card>

      {loading && !data ? (
        <PageSkeleton rows={5} />
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {data.summary.map((s) => (
              <div key={s.label} className={`surface rounded-xl px-4 py-3${id === 'expiring' ? ' min-w-48' : ''}`}>
                <p className="text-xl font-bold tabular-nums">{s.value}</p>
                <p className="text-xs text-muted">
                  {s.tone && s.tone in STATUS_META ? <Badge tone={STATUS_META[s.tone as keyof typeof STATUS_META].tone}>{s.label}</Badge> : s.label}
                </p>
              </div>
            ))}
          </div>
          <Card>
            {data.rows.length ? (
              <Table caption={meta.title}>
                <thead>
                  <tr>
                    {data.columns.map((c) => (
                      <TH key={c.key} className={c.align === 'right' ? 'text-right' : ''}>
                        {c.label}
                      </TH>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <TR key={i} onClick={data.links[i] ? () => navigate(data.links[i]!) : undefined}>
                      {data.columns.map((c) => (
                        <TD key={c.key} className={c.align === 'right' ? 'text-right tabular-nums' : c.key === 'agreement' ? 'font-mono text-[13px]' : ''}>
                          {r[c.key]}
                        </TD>
                      ))}
                    </TR>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState icon={<SearchX />} title="Nothing to report" description="No records match these filters." />
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
