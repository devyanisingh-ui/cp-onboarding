import { useEffect, useState, useSyncExternalStore } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Building2, CheckCheck, ChevronDown, FileText, Inbox, LogOut, Menu as MenuIcon, Plus, RefreshCcw, UserRound, Home, Users } from 'lucide-react';
import { useSession, useUser } from '@/context/SessionContext';
import { api } from '@/services/mockApi';
import { subscribe } from '@/services/db';
import { useApi } from '@/hooks/useApi';
import { useScrolled } from '@/hooks/misc';
import { cn } from '@/lib/cn';
import { ROLE_LABELS } from '@/lib/format';
import { timeAgo } from '@/lib/dates';
import { can } from '@/lib/permissions';
import type { Role } from '@/types';
import { Avatar, Drawer, EmptyState, IconButton, Menu, Select, Spinner, useToast } from '@/components/ui';
import { BrandName } from './Brand';
import { navFor } from './nav';

export function AppShell() {
  const user = useUser();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [location.pathname]);
  const items = navFor(user);

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow-pop">
        Skip to content
      </a>

      {/* Sidebar: full on desktop, icon rail on tablet, hidden on phone */}
      <aside className="glass-1 fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col border-r border-white/70 shadow-[1px_0_0_var(--glass-hairline)] md:flex lg:w-60" aria-label="Main">
        <div className="flex h-16 items-center px-4 lg:px-5">
          <NavLink to="/" aria-label="CP Onboarding home">
            <span className="lg:hidden">
              <BrandName collapsed />
            </span>
            <span className="hidden lg:block">
              <BrandName />
            </span>
          </NavLink>
        </div>
        {can(user, 'agreement.create') && (
          <div className="px-3 pt-4 lg:px-4">
            <NavLink
              to="/agreements/new"
              className="flex h-10 items-center justify-center gap-2 rounded-md bg-gradient-to-b from-primary-600 to-primary-700 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.22),var(--shadow-cta)] transition-all duration-150 hover:from-primary-700 hover:to-primary-800 active:translate-y-px"
              title="New CP agreement"
            >
              <Plus className="size-4" aria-hidden />
              <span className="hidden lg:inline">New CP agreement</span>
              <span className="sr-only lg:hidden">New CP agreement</span>
            </NavLink>
          </div>
        )}
        <nav className="flex-1 overflow-y-auto px-3 py-5 lg:px-4">
          {[items.slice(0, 4), items.slice(4)].filter((g) => g.length).map((group, gi) => (
          <div key={gi} className={cn(gi > 0 && 'mt-6')}>
          <p className="text-eyebrow mb-2 hidden px-3 text-[10.5px] text-subtle lg:block">{gi === 0 ? 'Workspace' : 'Insights & admin'}</p>
          {gi > 0 && <div className="mx-2 mb-3 border-t border-line/70 lg:hidden" aria-hidden />}
          <ul className="space-y-0.5">
            {group.map((it) => (
              <li key={it.to}>
                <NavLink
                  to={it.to}
                  end={it.end}
                  title={it.label}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex h-10 items-center justify-center gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-150 lg:justify-start',
                      isActive
                        ? "bg-white/90 text-primary-800 shadow-[var(--glass-highlight),var(--shadow-card)] before:absolute before:-left-3 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-full before:bg-primary-600 before:content-[''] lg:before:-left-4"
                        : 'text-ink-soft hover:bg-white/60 hover:text-ink',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <it.icon className={cn('size-5 shrink-0', isActive ? 'text-primary-600' : 'text-subtle group-hover:text-ink-soft')} />
                      <span className="hidden lg:inline">{it.label}</span>
                      <span className="sr-only lg:hidden">{it.label}</span>
                      {it.to === '/tasks' && <TaskCount className="ml-auto hidden lg:inline-flex" />}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
          </div>
          ))}
        </nav>
        <div className="mx-4 mb-4 hidden rounded-lg border border-white/80 bg-white/50 p-3 text-xs text-muted lg:block">
          <p className="font-medium text-ink-soft">Prototype build</p>
          <p>Mock data · no real SSO</p>
        </div>
      </aside>

      <div className="md:pl-[72px] lg:pl-60">
        <Header onMenu={() => setMoreOpen(true)} />
        <main id="main" tabIndex={-1} className="w-full px-4 pb-28 pt-6 outline-none sm:px-6 md:pb-16 lg:px-8 lg:pt-8 xl:px-10">
          {/* Keyed on the path so each screen enters with a short fade-up. */}
          <div key={location.pathname} className="animate-page-in">
            <Outlet />
          </div>
        </main>
      </div>

      <BottomNav onMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  );
}

function useUnreadCount() {
  return useSyncExternalStore(subscribe, () => {
    try {
      // Cheap synchronous read for the badge.
      return api.inbox.unreadCount();
    } catch {
      return 0;
    }
  });
}

function TaskCount({ className }: { className?: string }) {
  const { data } = useApi(() => api.inbox.tasks({}), []);
  const overdue = data?.filter((t) => t.overdue).length ?? 0;
  if (!data?.length) return null;
  return (
    <span className={cn('min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold', overdue ? 'bg-danger-600 text-white' : 'bg-sunken text-ink-soft', className)}>
      {data.length}
    </span>
  );
}

function Header({ onMenu }: { onMenu: () => void }) {
  // Light glass at the top of the page; once content scrolls underneath, a near-opaque surface
  // so the content passing behind the header doesn't show through it.
  const scrolled = useScrolled();
  const { institutionId, setInstitutionId, myInstitutions } = useSession();
  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex h-16 items-center gap-2 border-b px-4 transition-[background-color,box-shadow,border-color] duration-200 ease-out sm:px-6 lg:px-8 xl:px-10',
        scrolled
          ? 'border-line/80 bg-[rgb(255_255_255/0.94)] shadow-[0_1px_0_var(--glass-hairline),0_6px_20px_-10px_rgb(22_28_56/0.18)] backdrop-blur-xl backdrop-saturate-150'
          : 'glass-1 border-white/70 shadow-[0_1px_0_var(--glass-hairline)]',
      )}
    >
      <div className="md:hidden">
        <NavLink to="/" aria-label="Home">
          <BrandName collapsed />
        </NavLink>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {myInstitutions.length > 1 ? (
          <Select
            aria-label="Institution"
            size="sm"
            prefix={<Building2 aria-hidden />}
            value={institutionId}
            onChange={(e) => setInstitutionId(e.target.value)}
            wrapperClassName="min-w-0 w-[46vw] sm:w-72"
            className="border-line/80 bg-white/70 shadow-xs"
          >
            <option value="">All my institutions</option>
            {myInstitutions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.shortCode} · {i.legalName}
              </option>
            ))}
          </Select>
        ) : (
          myInstitutions[0] && (
            <span className="hidden items-center gap-2 truncate text-sm font-medium text-ink-soft sm:flex">
              <Building2 className="size-4 text-muted" aria-hidden />
              {myInstitutions[0].legalName}
            </span>
          )
        )}
      </div>
      <PersonaSwitcher />
      <NotificationBell />
      <UserMenu />
      <IconButton label="Open menu" className="md:hidden" onClick={onMenu}>
        <MenuIcon className="size-5" />
      </IconButton>
    </header>
  );
}

/** Prototype-only role switcher so reviewers can see each persona (PRD Appendix A). */
function PersonaSwitcher() {
  const { user, switchPersona } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const personas = api.auth.personas;
  const accounts = api.auth.demoAccounts();
  const roles = Object.keys(personas) as Role[];
  const current = roles.find((r) => personas[r] === user?.id);
  const extras = accounts.filter((a) => !Object.values(personas).includes(a.id));
  const go = async (id: string) => {
    try {
      await switchPersona(id);
      const a = accounts.find((x) => x.id === id);
      toast.info(`Now viewing as ${a?.name}`, a?.roles.map((r) => ROLE_LABELS[r]).join(', '));
      navigate('/');
    } catch (e) {
      toast.error('Could not switch', (e as Error).message);
    }
  };
  return (
    <Menu
      label="View as persona"
      trigger={(p) => (
        <button
          type="button"
          {...p}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-primary-300 bg-primary-50/70 px-2.5 text-xs font-semibold text-primary-800 transition-colors hover:bg-primary-100/70"
        >
          <RefreshCcw className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">{current ? ROLE_LABELS[current] : user?.roles.map((r) => ROLE_LABELS[r]).join(', ')}</span>
          <span className="sm:hidden">Role</span>
          <ChevronDown className="size-3.5" aria-hidden />
        </button>
      )}
      items={[
        { heading: 'View as (prototype)' },
        ...roles.map((r) => {
          const a = accounts.find((x) => x.id === personas[r]);
          return { label: `${ROLE_LABELS[r]} — ${a?.name ?? ''}`, onSelect: () => void go(personas[r]), active: user?.id === personas[r] };
        }),
        // Accounts added under Admin → Users that aren't the main persona for their role.
        ...(extras.length
          ? [
              'divider' as const,
              { heading: 'Other accounts' },
              ...extras.map((a) => ({ label: `${a.name} (${a.designation})`, onSelect: () => void go(a.id), active: user?.id === a.id })),
            ]
          : []),
      ]}
    />
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount();
  const navigate = useNavigate();
  const { data, loading } = useApi(() => (open ? api.inbox.notifications() : Promise.resolve([])), [open]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative inline-flex size-10 items-center justify-center rounded-md text-ink-soft hover:bg-[var(--surface-hover)] hover:text-ink"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex min-w-[18px] items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ring-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Notifications"
        footer={
          unread > 0 ? (
            <button type="button" className="flex items-center gap-2 text-sm font-semibold text-primary-700 hover:underline" onClick={() => void api.inbox.markRead()}>
              <CheckCheck className="size-4" /> Mark all as read
            </button>
          ) : undefined
        }
      >
        {loading && !data?.length ? (
          <div className="p-6">
            <Spinner />
          </div>
        ) : !data?.length ? (
          <EmptyState compact icon={<Bell />} title="You’re all caught up" description="New tasks, approvals and escalations will appear here." />
        ) : (
          <ul className="divide-y divide-line">
            {data.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    void api.inbox.markRead([n.id]);
                    setOpen(false);
                    navigate(n.link);
                  }}
                  className={cn('flex w-full gap-3 px-5 py-3.5 text-left hover:bg-[var(--surface-hover)]', !n.read && 'bg-primary-50/40')}
                >
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-primary-600')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{n.title}</span>
                    <span className="mt-0.5 block text-sm text-muted">{n.body}</span>
                    <span className="mt-1 block text-xs text-subtle">{timeAgo(n.createdAt)}</span>
                  </span>
                  {!n.read && <span className="sr-only">Unread</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Drawer>
    </>
  );
}

function UserMenu() {
  const user = useUser();
  const { signOut } = useSession();
  return (
    <Menu
      label="Account"
      trigger={(p) => (
        <button type="button" {...p} className="hidden items-center gap-2 rounded-md p-1 hover:bg-[var(--surface-hover)] md:flex" aria-label={`Account: ${user.name}`}>
          <Avatar name={user.name} size="sm" />
          <span className="hidden text-left leading-tight xl:block">
            <span className="block text-sm font-semibold text-ink">{user.name}</span>
            <span className="block text-xs text-muted">{user.designation}</span>
          </span>
          <ChevronDown className="hidden size-4 text-muted xl:block" aria-hidden />
        </button>
      )}
      items={[
        { heading: user.email },
        { note: <><span className="block font-medium text-ink">{user.name}</span><span className="block text-xs text-muted">{user.roles.map((r) => ROLE_LABELS[r]).join(', ')}</span></>, icon: <UserRound /> },
        'divider',
        { label: 'Sign out', onSelect: () => void signOut('manual'), icon: <LogOut />, danger: true },
      ]}
    />
  );
}

function BottomNav({ onMore }: { onMore: () => void }) {
  const user = useUser();
  const canCreate = can(user, 'agreement.create');
  const tab = 'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium';
  const cls = ({ isActive }: { isActive: boolean }) => cn(tab, isActive ? 'text-primary-700' : 'text-muted');
  return (
    <nav aria-label="Main" className="glass-3 safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-white/80 shadow-[0_-1px_0_var(--glass-hairline),0_-8px_24px_-12px_rgb(22_28_56/0.15)] md:hidden">
      <div className="flex h-16 items-stretch">
        <NavLink to="/" end className={cls}>
          <Home className="size-5" aria-hidden />
          Home
        </NavLink>
        <NavLink to="/tasks" className={cls}>
          <span className="relative">
            <Inbox className="size-5" aria-hidden />
          </span>
          Tasks
        </NavLink>
        {canCreate ? (
          <NavLink to="/agreements/new" className={cn(tab, 'text-primary-700')} aria-label="New CP agreement">
            <span className="-mt-5 flex size-12 items-center justify-center rounded-full bg-gradient-to-b from-primary-600 to-primary-700 text-white shadow-[var(--shadow-cta)] ring-4 ring-white/90 transition-transform active:scale-95">
              <Plus className="size-6" aria-hidden />
            </span>
            New
          </NavLink>
        ) : (
          <NavLink to="/agreements" className={cls}>
            <FileText className="size-5" aria-hidden />
            Agreements
          </NavLink>
        )}
        <NavLink to="/cps" className={cls}>
          <Users className="size-5" aria-hidden />
          CPs
        </NavLink>
        <button type="button" onClick={onMore} className={cn(tab, 'text-muted')}>
          <MenuIcon className="size-5" aria-hidden />
          More
        </button>
      </div>
    </nav>
  );
}

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useUser();
  const { signOut } = useSession();
  const items = navFor(user).filter((i) => !['/', '/tasks', '/cps'].includes(i.to));
  return (
    <Drawer open={open} onClose={onClose} title="More" side="bottom">
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <Avatar name={user.name} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{user.name}</p>
          <p className="truncate text-sm text-muted">{user.roles.map((r) => ROLE_LABELS[r]).join(', ')}</p>
        </div>
      </div>
      <ul className="p-2">
        {items.map((it) => (
          <li key={it.to}>
            <NavLink to={it.to} className="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-ink hover:bg-[var(--surface-hover)]">
              <it.icon className="size-5 text-muted" />
              {it.label}
            </NavLink>
          </li>
        ))}
        <li>
          <button type="button" onClick={() => void signOut('manual')} className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-danger-700 hover:bg-danger-50">
            <LogOut className="size-5" />
            Sign out
          </button>
        </li>
      </ul>
    </Drawer>
  );
}
