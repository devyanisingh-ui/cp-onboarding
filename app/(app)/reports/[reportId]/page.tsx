'use client';

import { RequireCap } from '@/components/guards';
import { ReportView } from '@/screens/Reports';

export default function Page() {
  return <RequireCap cap="reports.view"><ReportView /></RequireCap>;
}
