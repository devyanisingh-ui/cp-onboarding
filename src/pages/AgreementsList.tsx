import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, Plus, SearchX } from 'lucide-react';
import type { CpType } from '@/types';
import { useSession } from '@/context/SessionContext';
import { api } from '@/services/mockApi';
import { useApi } from '@/hooks/useApi';
import { useDebounced, useDocumentTitle } from '@/hooks/misc';
import { CP_TYPE_LABELS, CP_TYPES } from '@/lib/format';
import { STATUS_META } from '@/lib/status';
import { ButtonLink, Card, EmptyState, ErrorState, Pagination, PageSkeleton, SearchInput, Select, Toggle } from '@/components/ui';
import { PageHeader } from '@/components/common';
import { AgreementTable } from '@/components/lists';

const PAGE = 12;

export function AgreementsList() {
  useDocumentTitle('Agreements');
  const { institutionId: headerInst, myInstitutions, can } = useSession();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const status = params.get('status') ?? '';
  const cpType = (params.get('type') ?? '') as CpType | '';
  const inst = params.get('inst') ?? '';
  const mine = params.get('mine') === '1';
  const nonStandard = params.get('nonStandard') === '1';
  const set = (k: string, v: string) => {
    if (v) params.set(k, v);
    else params.delete(k);
    setParams(params, { replace: true });
    setPage(1);
  };
  const dq = useDebounced(q);
  const institutionId = inst || headerInst;
  const { data, error, loading, reload } = useApi(
    () => api.agreements.list({ q: dq, status, cpType, institutionId: institutionId || undefined, mine, nonStandard }),
    [dq, status, cpType, institutionId, mine, nonStandard],
  );
  const filtered = !!(dq || status || cpType || inst || mine || nonStandard);
  const rows = (data ?? []).slice((page - 1) * PAGE, page * PAGE);

  return (
    <div>
      <PageHeader
        title="Agreements"
        subtitle="All agreements in your scope. Use the filters or search by CP name or agreement ID."
        actions={can('agreement.create') ? <ButtonLink to="/agreements/new" icon={<Plus className="size-4" />}>New CP agreement</ButtonLink> : undefined}
      />
      <Card>
        <div className="space-y-3 border-b border-line p-4 sm:p-5">
          <SearchInput label="Search agreements" placeholder="Search by CP name or agreement ID" value={q} onChange={(v) => (setQ(v), setPage(1))} />
          <div className="grid grid-cols-2 gap-3 lg:flex lg:items-center">
            <label className="lg:w-52">
              <span className="sr-only">Status</span>
              <Select value={status} onChange={(e) => set('status', e.target.value)}>
                <option value="">All statuses</option>
                <option value="in_progress">In progress (before Active)</option>
                <option value="closed">Closed</option>
                {Object.entries(STATUS_META).map(([k, m]) => (
                  <option key={k} value={k}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="lg:w-44">
              <span className="sr-only">CP type</span>
              <Select value={cpType} onChange={(e) => set('type', e.target.value)}>
                <option value="">All CP types</option>
                {CP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CP_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </label>
            {myInstitutions.length > 1 && (
              <label className="lg:w-40">
                <span className="sr-only">Institution</span>
                <Select value={inst} onChange={(e) => set('inst', e.target.value)}>
                  <option value="">All institutions</option>
                  {myInstitutions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.shortCode}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            {can('agreement.create') && <Toggle checked={mine} onChange={(v) => set('mine', v ? '1' : '')} label="Mine only" />}
            <Toggle checked={nonStandard} onChange={(v) => set('nonStandard', v ? '1' : '')} label="Non-standard" />
            {filtered && (
              <button type="button" className="justify-self-start text-sm font-semibold text-primary-700 hover:underline lg:ml-auto" onClick={() => (setQ(''), setParams({}, { replace: true }))}>
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
            <EmptyState icon={<SearchX />} title="No agreements match" description="Try another search or clear the filters." />
          ) : (
            <EmptyState icon={<FileText />} title="No agreements yet" description="No drafts yet — start a new CP agreement." action={can('agreement.create') ? <ButtonLink to="/agreements/new">New CP agreement</ButtonLink> : undefined} />
          )
        ) : (
          <AgreementTable items={rows} caption="Agreements" />
        )}
        {data && <Pagination page={page} pageSize={PAGE} total={data.length} onChange={setPage} />}
      </Card>
    </div>
  );
}
