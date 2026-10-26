import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlarmClock, AlertTriangle, CalendarClock, CheckCircle2, Inbox, Info } from 'lucide-react';
import type { TaskType } from '@/types';
import { useSession } from '@/context/SessionContext';
import { api } from '@/services/mockApi';
import { useApi } from '@/hooks/useApi';
import { useDocumentTitle } from '@/hooks/misc';
import { TASK_TYPE_LABELS } from '@/lib/links';
import { formatShortDate } from '@/lib/dates';
import { Card, EmptyState, ErrorState, PageSkeleton, Select, StatTile, Tabs, Toggle } from '@/components/ui';
import { PageHeader } from '@/components/common';
import { TASK_TYPE_META, TaskRow } from '@/components/lists';
import type { TaskItem } from '@/services/api/inbox';
import { cn } from '@/lib/cn';

export function Tasks() {
  useDocumentTitle('My Tasks');
  const { institutionId: headerInst, myInstitutions } = useSession();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const [type, setType] = useState<TaskType | ''>('');
  const [inst, setInst] = useState('');
  const overdueOnly = params.get('overdue') === '1';
  // The Overdue tile (a link to ?overdue=1) is about open tasks: show them, whichever tab was active.
  useEffect(() => {
    if (overdueOnly) setTab('open');
  }, [overdueOnly]);
  const institutionId = inst || headerInst;
  const { data, error, loading, reload } = useApi(() => api.inbox.tasks({ type, institutionId: institutionId || undefined, status: tab }), [type, institutionId, tab]);
  // The tiles always describe the open workload, whichever tab the list is showing.
  const openTasks = useApi(() => api.inbox.tasks({ type, institutionId: institutionId || undefined, status: 'open' }), [type, institutionId, tab]);
  const items = (data ?? []).filter((t) => !overdueOnly || t.overdue);
  const open = openTasks.data ?? [];
  const overdue = open.filter((t) => t.overdue).length;
  const dueWeek = open.filter((t) => !t.overdue && t.daysLeft <= 7).length;
  const escalated = open.filter((t) => t.escalatedToMe).length;

  return (
    <div>
      <PageHeader title="My Tasks" subtitle="Everything waiting on you, sorted by due date. Open a task to act on it." />
      {openTasks.data && (
        <div className="mb-5 grid auto-rows-fr grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Open tasks" value={open.length} icon={<Inbox />} tone="accent" />
          <StatTile label="Overdue" hint="SLA breached" hintTone={overdue ? 'danger' : 'muted'} value={overdue} icon={<AlarmClock />} tone={overdue ? 'red' : 'grey'} to={overdueOnly ? '/tasks' : '/tasks?overdue=1'} />
          <StatTile label="Due this week" value={dueWeek} icon={<CalendarClock />} tone="amber" />
          <StatTile label="Escalated to you" value={escalated} icon={<AlertTriangle />} tone={escalated ? 'orange' : 'grey'} />
        </div>
      )}
      <Card>
        <div className="px-5 pt-2">
          <Tabs
            label="Task status"
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'open', label: 'Open', count: openTasks.data?.length },
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
          <div>
            {buckets(items).map((b) => (
              <section key={b.key} aria-label={b.label}>
                <div className={cn('flex items-center gap-2 border-b border-line/70 px-5 py-2', b.band)}>
                  <span className={cn('size-2 rounded-full', b.dot)} aria-hidden />
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{b.label}</h2>
                  <span className="rounded-full bg-white px-1.5 text-xs font-semibold tabular-nums text-ink-soft ring-1 ring-line">{b.items.length}</span>
                </div>
                <div className="divide-y divide-line">
                  {b.items.map((t) => (
                    <TaskRow key={t.id} t={t} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg opacity-70 ring-1 ring-inset [&_svg]:size-4', TASK_TYPE_META[t.type].tone)} aria-hidden>
                  {TASK_TYPE_META[t.type].icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink-soft">{t.title}</span>
                  <span className="block truncate text-xs text-muted">{TASK_TYPE_LABELS[t.type]}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700 ring-1 ring-inset ring-green-200">
                  <CheckCircle2 className="size-3" aria-hidden /> Done {formatShortDate(t.completedAt)}
                </span>
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

/** Open tasks grouped by how soon they are due (empty groups are hidden). */
function buckets(items: TaskItem[]) {
  return [
    { key: 'overdue', label: 'Overdue', dot: 'bg-danger-600', band: 'bg-danger-50/60', items: items.filter((t) => t.overdue) },
    { key: 'today', label: 'Due today', dot: 'bg-amber-500', band: 'bg-amber-50/60', items: items.filter((t) => !t.overdue && t.daysLeft === 0) },
    { key: 'week', label: 'This week', dot: 'bg-primary-500', band: 'bg-primary-50/50', items: items.filter((t) => t.daysLeft > 0 && t.daysLeft <= 7) },
    { key: 'later', label: 'Later', dot: 'bg-slate-400', band: 'bg-canvas/60', items: items.filter((t) => t.daysLeft > 7) },
  ].filter((b) => b.items.length);
}
