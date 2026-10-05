import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Flag, ShieldAlert } from 'lucide-react';
import type { AgreementSummary, TaskItem } from '@/services/mockApi';
import { cn } from '@/lib/cn';
import { formatShortDate, daysUntil } from '@/lib/dates';
import { CP_TYPE_LABELS } from '@/lib/format';
import { TASK_TYPE_LABELS } from '@/lib/links';
import { useMediaQuery } from '@/hooks/misc';
import { Badge, StatusBadge, Table, TD, TH, TR } from '@/components/ui';

export function AgreementFlags({ a }: { a: AgreementSummary }) {
  return (
    <>
      {a.nonStandard && <Badge tone="orange">Non-standard</Badge>}
      {a.source === 'legacy' && <Badge tone="grey">Legacy</Badge>}
      {a.rejected && a.status !== 'draft' && <Badge tone="red">Returned</Badge>}
      {a.overridePending && (
        <Badge tone="red" icon={<ShieldAlert className="size-3" aria-hidden />}>
          Override pending
        </Badge>
      )}
      {a.reviewFlag && (
        <Badge tone="amber" icon={<Flag className="size-3" aria-hidden />}>
          Review
        </Badge>
      )}
    </>
  );
}

/** Table on desktop, cards on phone (PRD §8). `compact` forces the card list, for narrow cards. */
export function AgreementTable({ items, caption, showOwner = true, compact }: { items: AgreementSummary[]; caption: string; showOwner?: boolean; compact?: boolean }) {
  const desktop = useMediaQuery('(min-width: 768px)');
  const navigate = useNavigate();
  if (!desktop || compact)
    return (
      <ul className="divide-y divide-line" aria-label={caption}>
        {items.map((a) => (
          <li key={a.id}>
            <Link to={`/agreements/${a.id}`} className="flex items-start gap-3 px-4 py-3.5 hover:bg-[var(--surface-hover)] sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{a.cpName}</p>
                <p className="mt-0.5 font-mono text-xs text-muted">{a.id}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={a.displayStatus} />
                  <AgreementFlags a={a} />
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  {a.institutionCode} · {CP_TYPE_LABELS[a.cpType]}
                  {a.endDate && ` · expires ${formatShortDate(a.endDate)}`}
                </p>
              </div>
              <ChevronRight className="mt-1 size-4 shrink-0 text-subtle" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    );
  return (
    <Table caption={caption}>
      <thead>
        <tr>
          <TH>CP / Agreement</TH>
          <TH>Status</TH>
          <TH className="hidden lg:table-cell">Institution</TH>
          <TH>Term</TH>
          {showOwner && <TH className="hidden xl:table-cell">Owner</TH>}
          <TH className="w-8">
            <span className="sr-only">Open</span>
          </TH>
        </tr>
      </thead>
      <tbody>
        {items.map((a) => (
          <TR key={a.id} onClick={() => navigate(`/agreements/${a.id}`)}>
            <TD>
              <Link to={`/agreements/${a.id}`} className="block font-semibold text-ink hover:text-primary-700" onClick={(e) => e.stopPropagation()}>
                {a.cpName}
              </Link>
              <span className="font-mono text-xs text-muted">{a.id}</span>
              <span className="block text-xs text-muted lg:hidden">
                {a.institutionCode} · {CP_TYPE_LABELS[a.cpType]}
              </span>
            </TD>
            <TD>
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={a.displayStatus} />
                <AgreementFlags a={a} />
              </div>
            </TD>
            <TD className="hidden lg:table-cell">
              <span className="font-medium">{a.institutionCode}</span>
              <span className="block text-xs text-muted">{CP_TYPE_LABELS[a.cpType]}</span>
            </TD>
            <TD className="whitespace-nowrap text-ink-soft">
              {a.startDate ? `${formatShortDate(a.startDate)} – ${formatShortDate(a.endDate)}` : <span className="text-subtle">Not set</span>}
              {a.status === 'active' && a.endDate && daysUntil(a.endDate) <= 60 && <span className="block text-xs font-medium text-orange-700">{daysUntil(a.endDate)} days left</span>}
            </TD>
            {showOwner && <TD className="hidden text-ink-soft xl:table-cell">{a.ownerName}</TD>}
            <TD>
              <ChevronRight className="size-4 text-subtle group-hover:text-primary-600" aria-hidden />
            </TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}

export function TaskRow({ t, compact }: { t: TaskItem; compact?: boolean }) {
  return (
    <Link
      to={t.link}
      className={cn('group flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--surface-hover)]', t.overdue && 'bg-danger-50/50 hover:bg-danger-50')}
    >
      <span className={cn('mt-1 size-2.5 shrink-0 rounded-full', t.overdue ? 'bg-danger-600' : t.daysLeft <= 1 ? 'bg-amber-500' : 'bg-primary-500')} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink group-hover:text-primary-800">{t.title}</p>
        <p className="mt-0.5 text-xs text-muted">
          {TASK_TYPE_LABELS[t.type]}
          {t.agreementId && <> · <span className="font-mono">{t.agreementId}</span></>}
          {t.institutionCode && ` · ${t.institutionCode}`}
        </p>
        {!compact && t.escalatedToId && (
          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-orange-700">
            <AlertTriangle className="size-3.5" aria-hidden />
            {t.escalatedToMe ? `Escalated to you · assigned to ${t.assigneeName}` : `Escalated to ${t.escalatedToName}`}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className={cn('text-xs font-semibold', t.overdue ? 'text-danger-700' : 'text-ink-soft')}>
          {t.overdue ? `${-t.daysLeft} day${t.daysLeft === -1 ? '' : 's'} overdue` : t.daysLeft === 0 ? 'Due today' : `Due in ${t.daysLeft} day${t.daysLeft === 1 ? '' : 's'}`}
        </p>
        <p className="text-xs text-subtle">{formatShortDate(t.dueDate)}</p>
      </div>
    </Link>
  );
}
