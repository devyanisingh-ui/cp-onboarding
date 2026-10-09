import { Link } from 'react-router-dom';
import { AlarmClock, ArrowRight, CalendarClock, CheckCircle2, FilePen, FileSignature, FileSearch, Inbox, Plus, Scale, ShieldCheck, Users } from 'lucide-react';
import { useSession, useUser } from '@/context/SessionContext';
import { api } from '@/services/mockApi';
import { useApi } from '@/hooks/useApi';
import { useDocumentTitle } from '@/hooks/misc';
import { can } from '@/lib/permissions';
import { ROLE_LABELS } from '@/lib/format';
import { ButtonLink, Card, CardHeader, EmptyState, ErrorState, PageSkeleton, StatTile } from '@/components/ui';
import { AgreementTable, TaskRow } from '@/components/lists';
import type { ReactNode } from 'react';

export function Home() {
  useDocumentTitle('Home');
  const user = useUser();
  const { institutionId } = useSession();
  const { data, error, loading, reload } = useApi(() => api.inbox.dashboard(institutionId || undefined), [institutionId, user.id]);
  const canCreate = can(user, 'agreement.create');
  const isBd = user.roles.includes('bd_exec');
  const isLegal = user.roles.includes('legal');
  const isAdmin = user.roles.includes('admin');
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  // Role-specific tiles (after "My pending tasks" and "Overdue").
  const tiles: ReactNode[] = [];
  if (isBd) {
    tiles.push(<StatTile key="d" label="Drafts" value={data.drafts.length} icon={<FilePen />} tone="grey" to="/agreements?status=draft" />);
    tiles.push(<StatTile key="s" label="Awaiting signed copy" value={data.awaitingSigned.length} icon={<FileSignature />} tone="blue" to="/agreements?status=approved_for_signing" />);
  }
  if (isLegal || isAdmin) tiles.push(<StatTile key="p" label="Pending Legal approval" value={data.pendingApproval.length} icon={<CheckCircle2 />} tone="amber" to="/agreements?status=pending_approval" />);
  if (isAdmin) tiles.push(<StatTile key="g" label="Awaiting Gate 2" value={data.pendingGate2.length} icon={<ShieldCheck />} tone="purple" to="/agreements?status=signed_copy_uploaded" />);
  if (isLegal) tiles.push(<StatTile key="n" label="Non-standard (live)" value={data.counts.nonStandard} icon={<Scale />} tone="orange" to="/agreements?nonStandard=1" />);
  tiles.push(<StatTile key="e" label="Expiring in 60 days" value={data.expiring.length} icon={<CalendarClock />} tone="orange" to="/agreements?status=expiring" />);
  const activeTile = <StatTile key="a" label="Active agreements" value={data.counts.active} icon={<Users />} tone="green" to="/agreements?status=active" />;
  if (isAdmin) tiles.push(activeTile);

  /*
   * Tiles are kept to an even count so their edges line up with the two-column cards below
   * (with equal gaps, tile 2's right edge sits exactly on the cards' centre seam).
   * If the count would be odd, "Overdue" folds into the pending-tasks tile as a red note;
   * if it is still odd, "Active agreements" is added.
   */
  const foldOverdue = (tiles.length + 2) % 2 === 1;
  const pendingTile = (
    <StatTile
      key="t"
      label="My pending tasks"
      value={data.pendingTasks.length}
      icon={<Inbox />}
      tone="accent"
      to={foldOverdue && data.overdueCount ? '/tasks?overdue=1' : '/tasks'}
      hint={foldOverdue ? (data.overdueCount ? `${data.overdueCount} overdue (SLA breached)` : 'None overdue') : undefined}
      hintTone={foldOverdue && data.overdueCount ? 'danger' : 'muted'}
    />
  );
  const overdueTile = <StatTile key="o" label="Overdue (SLA breached)" value={data.overdueCount} icon={<AlarmClock />} tone={data.overdueCount ? 'red' : 'grey'} to="/tasks?overdue=1" />;
  tiles.unshift(...(foldOverdue ? [pendingTile] : [pendingTile, overdueTile]));
  if (tiles.length % 2 === 1 && !tiles.includes(activeTile)) tiles.push(activeTile);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-eyebrow text-primary-700">{user.roles.map((r) => ROLE_LABELS[r]).join(' · ')}</p>
          <h1 className="text-display mt-1.5">
            {greeting}, {user.name.split(' ')[0] === 'Prof.' ? user.name : user.name.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {data.pendingTasks.length ? `You have ${data.pendingTasks.length} task${data.pendingTasks.length === 1 ? '' : 's'} waiting${data.overdueCount ? `, ${data.overdueCount} overdue` : ''}.` : 'Nothing is waiting on you right now.'}
          </p>
        </div>
        {canCreate && (
          <ButtonLink to="/agreements/new" size="lg" icon={<Plus className="size-5" />} className="w-full sm:w-auto">
            New CP agreement
          </ButtonLink>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-[repeat(var(--tiles),minmax(0,1fr))] xl:gap-6" style={{ ['--tiles' as string]: Math.min(tiles.length, 6) }}>
        {tiles}
      </div>

      {canCreate && data.wizardDrafts > 0 && (
        <Link to="/agreements/new" className="flex items-center justify-between rounded-xl border border-primary-200 bg-primary-50 px-5 py-3.5 text-sm hover:bg-primary-100/60">
          <span>
            <span className="font-semibold text-primary-900">You have {data.wizardDrafts} unfinished agreement{data.wizardDrafts === 1 ? '' : 's'}.</span>
            <span className="text-primary-800"> Pick up where you left off.</span>
          </span>
          <ArrowRight className="size-4 text-primary-700" aria-hidden />
        </Link>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="My pending tasks" description="Sorted by due date" icon={<Inbox />} action={<ButtonLink to="/tasks" variant="link" size="sm">View all</ButtonLink>} />
          {data.pendingTasks.length ? (
            <div className="divide-y divide-line">
              {data.pendingTasks.slice(0, 6).map((t) => (
                <TaskRow key={t.id} t={t} />
              ))}
            </div>
          ) : (
            <EmptyState compact icon={<CheckCircle2 />} title="All caught up" description={isBd ? 'No tasks right now — start a new CP agreement when you have a partner ready.' : 'Approvals and reviews routed to you will show up here.'} action={isBd ? <ButtonLink to="/agreements/new" icon={<Plus className="size-4" />}>New CP agreement</ButtonLink> : undefined} />
          )}
        </Card>

        <Card>
          <CardHeader title="Expiring in 60 days" description="Renewal decisions are due 30 days before expiry" icon={<CalendarClock />} action={<ButtonLink to="/agreements?status=expiring" variant="link" size="sm">View all</ButtonLink>} />
          {data.expiring.length ? (
            <AgreementTable items={data.expiring.slice(0, 5)} caption="Expiring agreements" showOwner={!isBd} compact />
          ) : (
            <EmptyState compact icon={<CalendarClock />} title="No agreements expiring soon" description="Agreements appear here 60 days before their expiry date." />
          )}
        </Card>
      </div>

      {isBd && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title="Drafts" icon={<FilePen />} action={<ButtonLink to="/agreements?status=draft" variant="link" size="sm">View all</ButtonLink>} />
            {data.drafts.length ? (
              <AgreementTable items={data.drafts.slice(0, 5)} caption="Drafts" showOwner={false} compact />
            ) : (
              <EmptyState compact icon={<FilePen />} title="No drafts yet" description="Start a new CP agreement to create your first draft." action={<ButtonLink to="/agreements/new" icon={<Plus className="size-4" />}>New CP agreement</ButtonLink>} />
            )}
          </Card>
          <Card>
            <CardHeader title="Awaiting signed copy" description="Print, sign on stamp paper, then upload" icon={<FileSignature />} />
            {data.awaitingSigned.length ? (
              <AgreementTable items={data.awaitingSigned.slice(0, 5)} caption="Awaiting signed copy" showOwner={false} compact />
            ) : (
              <EmptyState compact icon={<FileSignature />} title="Nothing to get signed" description="Approved agreements wait here until you upload the signed copy." />
            )}
          </Card>
        </div>
      )}

      {(isLegal || isAdmin) && (
        <Card>
          <CardHeader
            title={isAdmin ? 'Awaiting Gate 2 verification' : 'Pending Legal approval(s)'}
            icon={<FileSearch />}
          />
          {(isAdmin ? data.pendingGate2 : data.pendingApproval).length ? (
            <AgreementTable items={(isAdmin ? data.pendingGate2 : data.pendingApproval).slice(0, 6)} caption="Queue" />
          ) : (
            <EmptyState compact icon={<CheckCircle2 />} title="Queue is empty" description="Nothing is waiting for your review." />
          )}
        </Card>
      )}
    </div>
  );
}
