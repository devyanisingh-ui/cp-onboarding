import { useEffect, useRef } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '@/context/SessionContext';
import { cn } from '@/lib/cn';
import { ADMIN_SECTIONS } from '@/components/layout/nav';
import { PageHeader } from '@/components/common';

export function AdminLayout() {
  const { can } = useSession();
  const { pathname } = useLocation();
  const items = ADMIN_SECTIONS.filter((i) => can(i.cap));
  const navRef = useRef<HTMLElement>(null);
  // On phones the section tabs scroll sideways: keep the current one in view.
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && active && nav.scrollWidth > nav.clientWidth)
      nav.scrollTo({ left: nav.scrollLeft + active.getBoundingClientRect().left - nav.getBoundingClientRect().left - 16 });
  }, [pathname]);
  if (!items.length) return <Navigate to="/" replace />;
  if (/\/admin\/?$/.test(pathname)) return <Navigate to={items[0]!.to} replace />;
  return (
    <div>
      <PageHeader title={can('config.manage') ? 'Admin console' : 'Templates & configuration'} subtitle={can('config.manage') ? 'Master data, versions, people and rules. Every change is audit-logged.' : 'Read-only unless your role approves versions.'} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
        {/* Below xl the sections scroll sideways; the faded right edge shows there are more. */}
        <nav ref={navRef} aria-label="Admin sections" className="min-w-0 -mx-4 overflow-x-auto px-4 [scrollbar-width:none] max-xl:[mask-image:linear-gradient(to_right,#000_calc(100%-3rem),transparent)] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 xl:mx-0 xl:px-0">
          <ul className="flex gap-1.5 xl:flex-col">
            {items.map((i) => (
              <li key={i.to} className="shrink-0">
                <NavLink
                  to={i.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive ? 'bg-white text-primary-800 shadow-card ring-1 ring-line' : 'text-ink-soft hover:bg-white/70 hover:text-ink',
                    )
                  }
                >
                  <i.icon className="size-4 text-subtle" aria-hidden />
                  {i.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export function ReadOnlyNote() {
  const { can } = useSession();
  if (can('config.manage')) return null;
  return <p className="mb-4 rounded-md bg-sunken px-3 py-2 text-xs text-muted">Read-only: only Admin can change this.</p>;
}
