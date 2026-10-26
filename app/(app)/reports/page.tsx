'use client';

import { RequireCap } from '@/components/guards';
import { Reports } from '@/screens/Reports';

export default function Page() {
  return <RequireCap cap="reports.view"><Reports /></RequireCap>;
}
