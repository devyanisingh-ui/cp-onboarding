'use client';

import { useEffect, type ComponentProps, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** True when `to` is the current page, or (unless `end`) a parent of it. */
export function isActivePath(pathname: string, to: string, end = false) {
  const path = to.split(/[?#]/)[0]!.replace(/\/$/, '') || '/';
  if (pathname === path) return true;
  if (end) return false;
  return path === '/' || pathname.startsWith(`${path}/`);
}

type NavLinkProps = Omit<ComponentProps<typeof Link>, 'href' | 'className' | 'children'> & {
  to: string;
  /** Only active on exactly this path, not on the pages under it. */
  end?: boolean;
  className?: string | ((s: { isActive: boolean }) => string);
  children?: ReactNode | ((s: { isActive: boolean }) => ReactNode);
};

/** A link that knows whether it points at the current page: sets aria-current and active styles. */
export function NavLink({ to, end, className, children, ...rest }: NavLinkProps) {
  const isActive = isActivePath(usePathname() ?? '/', to, end);
  return (
    <Link href={to} aria-current={isActive ? 'page' : undefined} className={typeof className === 'function' ? className({ isActive }) : className} {...rest}>
      {typeof children === 'function' ? children({ isActive }) : children}
    </Link>
  );
}

/** Sends the user to `to` as soon as it renders (replacing the current history entry). */
export function Redirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => router.replace(to), [router, to]);
  return null;
}

/** The query string as an editable copy, and a setter that writes it back to the address bar. */
export function useQueryParams() {
  const current = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const params = new URLSearchParams(current?.toString());
  const setParams = (next: URLSearchParams | Record<string, string>, opts: { replace?: boolean } = {}) => {
    const q = new URLSearchParams(next).toString();
    const url = q ? `${pathname}?${q}` : pathname;
    if (opts.replace) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  };
  return [params, setParams] as const;
}
