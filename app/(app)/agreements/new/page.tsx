'use client';

import { RequireCap } from '@/components/guards';
import { Wizard } from '@/screens/Wizard';

export default function Page() {
  return <RequireCap cap="agreement.create"><Wizard /></RequireCap>;
}
