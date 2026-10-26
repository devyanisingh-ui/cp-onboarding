'use client';

import { RequireCap } from '@/components/guards';
import { Verification } from '@/screens/Verification';

export default function Page() {
  return <RequireCap cap="gate1.approve"><Verification mode="legal" /></RequireCap>;
}
