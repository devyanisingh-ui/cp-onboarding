'use client';

import { RequireCap } from '@/components/guards';
import { AuditLog } from '@/screens/AuditLog';

export default function Page() {
  return <RequireCap cap="audit.view"><AuditLog /></RequireCap>;
}
