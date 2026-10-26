'use client';

import type { ReactNode } from 'react';
import { AdminLayout } from '@/screens/admin/AdminLayout';

export default function AdminSectionsLayout({ children }: { children: ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
