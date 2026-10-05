import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Inbox, Info } from 'lucide-react';
import type { TaskType } from '@/types';
import { useSession } from '@/context/SessionContext';
import { api } from '@/services/mockApi';
import { useApi } from '@/hooks/useApi';
import { useDocumentTitle } from '@/hooks/misc';
import { TASK_TYPE_LABELS } from '@/lib/links';
import { formatShortDate } from '@/lib/dates';
import { Card, EmptyState, ErrorState, PageSkeleton, Select, Tabs, Toggle } from '@/components/ui';
import { PageHeader } from '@/components/common';
import { TaskRow } from '@/components/lists';

export function Tasks() {
  useDocumentTitle('My Tasks');
  const { institutionId: headerInst, myInstitutions } = useSession();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const [type, setType] = useState<TaskType | ''>('');
  const [inst, setInst] = useState('');
  const overdueOnly = params.get('overdue') === '1';
  const institutionId = inst || headerInst;
  const { data, error, loading, reload } = useApi(() => api.inbox.tasks({ type, institutionId: institutionId || undefined, status: tab }), [type, institutionId, tab]);
  const items = (data ?? []).filter((t) => !overdueOnly || t.overdue);
  const overdue = data?.filter((t) => t.overdue).length ?? 0;

  return (
    <div>
      <PageHeader title="My Tasks" subtitle="Everything waiting on you, sorted by due date. Open a task to act on it." />
      <Card>
        <div className="px-5 pt-2">
          <Tabs
            label="Task status"
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'open', label: 'Open', count: tab === 'open' ? data?.length : undefined },
              { id: 'done', label: 'Completed' },
            ]}
          />
        </div>
        <div className="flex flex-col gap-3 border-b border-line px-5 py-3.5 sm:flex-row sm:items-center">
          <div className="grid flex-1 grid-cols-2 gap-3 sm:flex sm:flex-none">
            <label className="sm:w-56">
              <span className="sr-only">Task type</span>
              <Select value={type} onChange={(e) => setType(e.target.value as TaskType | '')}>
                <option value="">All task types</option>
                {Object.entries(TASK_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </label>
            {myInstitutions.length > 1 && (
              <label className="sm:w-48">
                <span className="sr-only">Institution</span>
                <Select value={inst} onChange={(e) => setInst(e.target.value)}>
                  <option value="">{headerInst ? `Header: ${myInstitutions.find((i) => i.id === headerInst)?.shortCode}` : 'All institutions'}</option>
                  {myInstitutions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.shortCode}
                    </option>
                  ))}
                </Select>
              </label>
            )}
          </div>
          {tab === 'open' && (
            <div className="sm:ml-auto sm:w-56">
              <Toggle
                checked={overdueOnly}
                onChange={(v) => {
                  if (v) params.set('overdue', '1');
                  else params.delete('overdue');
                  setParams(params, { replace: true });
                }}
                label={`Overdue only${overdue ? ` (${overdue})` : ''}`}
              />
            </div>
          )}
        </div>

        {loading && !data ? (
          <div className="p-5">
            <PageSkeleton rows={4} />
          </div>
        ) : error && !data ? (
          <div className="p-5">
            <ErrorState error={error} onRetry={reload} />
          </div>
        ) : !items.length ? (
          <EmptyState
            icon={tab === 'open' ? <CheckCircle2 /> : <Inbox />}
            title={tab === 'open' ? (overdueOnly ? 'Nothing overdue' : 'No open tasks') : 'No completed tasks yet'}
            description={tab === 'open' ? 'When something needs your approval, review or upload, it will appear here with its due date.' : 'Tasks you finish will be listed here.'}
          />
        ) : tab === 'open' ? (
          <div className="divide-y divide-line">
            {items.map((t) => (
              <TaskRow key={t.id} t={t} />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <CheckCircle2 className="size-4 shrink-0 text-success-600" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-ink-soft">{t.title}</span>
                <span className="shrink-0 text-xs text-muted">{formatShortDate(t.completedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <Info className="size-3.5" aria-hidden /> Each approval is reviewed individually — bulk approval is intentionally not available.
      </p>
    </div>
  );
}
