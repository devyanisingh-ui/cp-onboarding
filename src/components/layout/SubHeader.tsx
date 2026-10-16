import { useEffect, useRef } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Home } from 'lucide-react';
import { useUser } from '@/context/SessionContext';
import { getDb } from '@/services/db';
import { api } from '@/services/mockApi';
import { useScrolled } from '@/hooks/misc';
import { cn } from '@/lib/cn';
import { CP_TYPE_LABELS } from '@/lib/format';
import type { User } from '@/types';
import { ADMIN_SECTIONS } from './nav';

interface Crumb {
  label: string;
  to?: string;
}

const AGREEMENT_PAGES: Record<string, string> = {
  edit: 'Edit draft',
  preview: 'Preview',
  deviation: 'Deviations',
  upload: 'Upload signed copy',
  esign: 'Send for e-signature',
  verify: 'Gate 2 verification',
  renewal: 'Renewal',
  terminate: 'Termination',
};

/** Breadcrumb trail for a route. The last crumb is the current screen (no link). */
export function crumbsFor(pathname: string, user: User): Crumb[] {
  const [section, id, sub] = pathname.split('/').filter(Boolean);
  const db = getDb();
  const crumbs: Crumb[] = [{ label: 'Home', to: '/' }];
  switch (section) {
    case undefined:
      break;
    case 'tasks':
      crumbs.push({ label: 'My Tasks', to: '/tasks' });
      break;
    case 'cps':
      crumbs.push({ label: 'CPs', to: '/cps' });
      if (id) crumbs.push({ label: db.cps.find((c) => c.id === id)?.legalName ?? id, to: `/cps/${id}` });
      break;
    case 'agreements':
      crumbs.push({ label: 'Agreements', to: '/agreements' });
      if (id === 'new') crumbs.push({ label: 'New CP agreement', to: '/agreements/new' });
      else if (id) {
        crumbs.push({ label: id, to: `/agreements/${id}` });
        if (sub) crumbs.push({ label: AGREEMENT_PAGES[sub] ?? sub, to: `/agreements/${id}/${sub}` });
      }
      break;
    case 'reports':
      crumbs.push({ label: 'Reports', to: '/reports' });
      if (id) crumbs.push({ label: api.reports.list.find((r) => r.id === id)?.title ?? id, to: `/reports/${id}` });
      break;
    case 'audit':
      crumbs.push({ label: 'Audit log', to: '/audit' });
      break;
    case 'admin': {
      crumbs.push({ label: user.roles.includes('admin') ? 'Admin' : 'Templates & rates', to: '/admin' });
      const s = ADMIN_SECTIONS.find((x) => x.to === id);
      if (s) crumbs.push({ label: s.label, to: `/admin/${s.to}` });
      if (id === 'templates' && sub) {
        const t = db.templates.find((x) => x.id === sub);
        crumbs.push({ label: t ? `${CP_TYPE_LABELS[t.cpType]} v${t.version}` : sub, to: `/admin/templates/${sub}` });
      }
      break;
    }
    default:
      crumbs.push({ label: 'Page not found' });
  }
  const last = crumbs.at(-1)!;
  crumbs[crumbs.length - 1] = { label: last.label };
  return crumbs;
}

/** Section tabs for one agreement: its main pages, plus the action page currently open. */
function agreementTabs(pathname: string): { to: string; label: string; end?: boolean }[] {
  const [section, id, sub] = pathname.split('/').filter(Boolean);
  if (section !== 'agreements' || !id || id === 'new') return [];
  const base = `/agreements/${id}`;
  const tabs = [
    { to: base, label: 'Overview', end: true },
    { to: `${base}/preview`, label: 'Preview' },
    { to: `${base}/deviation`, label: 'Deviations' },
  ];
  if (sub && !['preview', 'deviation'].includes(sub) && AGREEMENT_PAGES[sub]) tabs.push({ to: `${base}/${sub}`, label: AGREEMENT_PAGES[sub] });
  return tabs;
}

/**
 * Second bar under the app header on every screen: a back button, where you are (breadcrumbs),
 * and — on agreement screens — tabs to move between that agreement's pages.
 */
export function SubHeader() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = useUser();
  const scrolled = useScrolled();
  const crumbs = crumbsFor(pathname, user);
  const parent = crumbs.at(-2);
  const tabs = agreementTabs(pathname);
  const tabsRef = useRef<HTMLElement>(null);
  // Phones: the tab row scrolls sideways; keep the current tab in view.
  useEffect(() => {
    const reveal = () => {
      const nav = tabsRef.current;
      const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
      const n = nav.getBoundingClientRect();
      const a = active.getBoundingClientRect();
      if (a.right > n.right) nav.scrollLeft += a.right - n.right + 8;
      else if (a.left < n.left) nav.scrollLeft -= n.left - a.left + 8;
    };
    reveal();
    // Tab widths change once the web font loads; check again then.
    void document.fonts?.ready.then(reveal);
  }, [pathname]);

  // The dashboard (Home) is the top of the app: nothing to go back to, so no sub-header.
  if (pathname === '/') return null;

  return (
    <div
      className={cn(
        'z-[15] border-b px-4 transition-[background-color,box-shadow,border-color] duration-200 ease-out sticky top-16 sm:px-6 lg:px-8 xl:px-10',
        scrolled
          ? 'border-line/80 bg-[rgb(255_255_255/0.94)] shadow-[0_6px_20px_-12px_rgb(22_28_56/0.18)] backdrop-blur-xl backdrop-saturate-150'
          : 'border-white/70 bg-white/45 backdrop-blur-md',
      )}
    >
      <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
        {/* Keeps room for the breadcrumb; when the tabs don’t fit beside it they wrap to a second row. */}
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:min-w-[24rem]">
          {parent?.to && (
            <button
              type="button"
              onClick={() => navigate(parent.to!)}
              aria-label={`Back to ${parent.label}`}
              title={`Back to ${parent.label}`}
              className="hit-area -ml-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-[var(--surface-hover)] hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden />
            </button>
          )}
          <nav aria-label="Breadcrumb" className="min-w-0">
            <ol className="flex min-w-0 items-center gap-1 text-sm">
              {crumbs.map((c, i) => {
                const isLast = i === crumbs.length - 1;
                // Phones: only the parent and the current screen fit.
                const hideOnPhone = i < crumbs.length - 2;
                return (
                  <li key={i} className={cn('flex min-w-0 items-center gap-1', hideOnPhone && 'max-sm:hidden', isLast && 'shrink')}>
                    {i > 0 && <ChevronRight className={cn('size-3.5 shrink-0 text-subtle', i === crumbs.length - 2 && 'max-sm:hidden')} aria-hidden />}
                    {c.to ? (
                      <Link to={c.to} title={i === 0 ? c.label : undefined} className="hit-area flex min-w-0 items-center truncate rounded text-muted transition-colors hover:text-primary-700">
                        {i === 0 ? <HomeCrumb /> : c.label}
                      </Link>
                    ) : (
                      <span aria-current="page" className={cn('flex min-w-0 items-center truncate font-semibold text-ink', !isLast && 'text-muted')}>
                        {i === 0 ? <HomeCrumb /> : c.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>
        {tabs.length > 0 && (
          <nav ref={tabsRef} aria-label="Agreement sections" className="-mx-1 max-w-full overflow-x-auto px-1 [scrollbar-width:none] max-sm:w-full">
            <ul className="flex gap-1">
              {tabs.map((t) => (
                <li key={t.to} className="shrink-0">
                  <NavLink
                    to={t.to}
                    end={t.end}
                    className={({ isActive }) =>
                      cn(
                        'inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors',
                        isActive ? 'bg-white text-primary-800 shadow-card ring-1 ring-line' : 'text-ink-soft hover:bg-white/70 hover:text-ink',
                      )
                    }
                  >
                    {t.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}

/** The first breadcrumb is a house icon; screen readers still hear "Home". */
function HomeCrumb() {
  return (
    <>
      <Home className="size-4 shrink-0" aria-hidden />
      <span className="sr-only">Home</span>
    </>
  );
}
