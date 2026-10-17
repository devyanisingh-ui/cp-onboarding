import { useEffect, useRef, useState } from 'react';
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

  // Pinned under the app header and sub-header; once stuck it gets the sub-header's frosted band.
  const band = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const on = () => {
      const el = band.current;
      if (el) setStuck(el.getBoundingClientRect().top <= parseFloat(getComputedStyle(el).top) + 0.5 && window.scrollY > 0);
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => {
      window.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
    };
  }, [pathname]);

  if (!tabs.length) return null;
  return (
    <div
      ref={band}
      className={cn(
        // Bleeds to the edges of the content column (same gutters as <main>) so the band spans it.
        'sticky top-[calc(4rem+var(--subheader-h,0px))] z-10 -mx-4 -mt-3 mb-4 border-b px-4 py-2 transition-[background-color,box-shadow,border-color] duration-200 ease-out sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 xl:-mx-10 xl:px-10',
        stuck ? 'border-line/80 bg-[rgb(255_255_255/0.94)] shadow-[0_6px_20px_-12px_rgb(22_28_56/0.18)] backdrop-blur-xl backdrop-saturate-150' : 'border-transparent',
      )}
    >
    <nav ref={tabsRef} aria-label="Agreement sections" className="max-w-full overflow-x-auto [scrollbar-width:none]">
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
    </div>
  );
}
