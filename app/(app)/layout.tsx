'use client';

import type { ReactNode } from 'react';
import { RequireAuth } from '@/components/guards';
import { AppShell } from '@/components/layout/AppShell';

/** Every page behind sign-in shares the app shell (sidebar, header, bottom navigation). */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
