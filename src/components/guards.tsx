'use client';

import type { ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Compass } from 'lucide-react';
import { useSession } from '@/context/SessionContext';
import type { Capability } from '@/lib/permissions';
import { ButtonLink, EmptyState } from '@/components/ui';
import { Redirect } from './navigation';

/** Signed-out users go to sign-in, which brings them back here afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const pathname = usePathname() ?? '/';
  const query = useSearchParams()?.toString();
  if (!user) return <Redirect to={`/signin?from=${encodeURIComponent(pathname + (query ? `?${query}` : ''))}`} />;
  return <>{children}</>;
}

/** UI guard; the mock API enforces the same rules on every call. */
export function RequireCap({ cap, children }: { cap: Capability; children: ReactNode }) {
  const { can } = useSession();
  if (!can(cap)) return <Redirect to="/" />;
  return <>{children}</>;
}

/** Where the sign-in guard sent the user from; only paths inside the app are followed. */
function useReturnPath() {
  const from = useSearchParams()?.get('from') ?? '';
  return from.startsWith('/') && !from.startsWith('//') ? from : '/';
}

/** The sign-in page: once signed in (or already signed in), go back to the page that asked for it. */
export function SignedOutOnly({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const back = useReturnPath();
  return user ? <Redirect to={back} /> : <>{children}</>;
}

export function NotFound() {
  return (
    <EmptyState
      icon={<Compass />}
      title="Page not found"
      description="The link may be wrong, or the page has moved."
      action={<ButtonLink to="/">Go to Home</ButtonLink>}
    />
  );
}
