import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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

export const AGREEMENT_PAGES: Record<string, string> = {
  edit: 'Edit draft',
  preview: 'Preview',
  deviation: 'Deviations',
  upload: 'Upload signed copy',
  esign: 'Send for e-signature',
  verify: 'Gate 2 verification',
  'legal-review': 'Legal review',
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

/**
 * Second bar under the app header on every screen: a back button and where you are (breadcrumbs).
 * Agreement screens show their section tabs under the page title instead (AgreementTabs).
 */
export function SubHeader() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = useUser();
  const scrolled = useScrolled();
  const crumbs = crumbsFor(pathname, user);
  const parent = crumbs.at(-2);
  // Publish the bar's height (--subheader-h) so content can stick just below it (agreement tabs).
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bar.current;
    const root = document.documentElement;
    if (!el) return root.style.setProperty('--subheader-h', '0px');
    const set = () => root.style.setProperty('--subheader-h', `${el.offsetHeight}px`);
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pathname === '/']);

  // The dashboard (Home) is the top of the app: nothing to go back to, so no sub-header.
  if (pathname === '/') return null;

  return (
    <div
      ref={bar}
      className={cn(
        'z-[15] border-b px-4 transition-[background-color,box-shadow,border-color] duration-200 ease-out sticky top-16 sm:px-6 lg:px-8 xl:px-10',
        scrolled
          ? 'border-line/80 bg-[rgb(255_255_255/0.94)] shadow-[0_6px_20px_-12px_rgb(22_28_56/0.18)] backdrop-blur-xl backdrop-saturate-150'
          : 'border-white/70 bg-white/45 backdrop-blur-md',
      )}
    >
      <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
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
                      <Link to={c.to} title={i === 0 ? c.label : undefined} className="group/home hit-area flex min-w-0 items-center truncate rounded text-muted transition-colors hover:text-primary-700">
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
      </div>
    </div>
  );
}

/** The first breadcrumb is a house icon; screen readers still hear "Home". */
function HomeCrumb() {
  return (
    <>
      {/* A small gradient badge, so home stands out at the start of the trail. */}
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary-500 via-primary-600 to-accent-500 text-white shadow-[0_2px_6px_-1px_rgb(18_122_153/0.45),inset_0_1px_0_rgb(255_255_255/0.35)] ring-1 ring-white/60 transition-transform duration-200 group-hover/home:-translate-y-px group-hover/home:scale-105"
        aria-hidden
      >
        <Home className="size-3.5" strokeWidth={2.25} />
      </span>
      <span className="sr-only">Home</span>
    </>
  );
}
