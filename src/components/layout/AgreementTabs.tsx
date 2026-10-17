import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { AGREEMENT_PAGES } from './SubHeader';

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
 * Tabs to move between one agreement's pages, shown under the agreement's title and details
 * (PageHeader renders it). Nothing on other screens.
 */
export function AgreementTabs() {
  const { pathname } = useLocation();
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

  if (!tabs.length) return null;
  return (
    <nav ref={tabsRef} aria-label="Agreement sections" className="mt-4 max-w-full overflow-x-auto [scrollbar-width:none]">
      <ul className="inline-flex gap-1 rounded-lg border border-line/70 bg-sunken/60 p-1">
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
  );
}
