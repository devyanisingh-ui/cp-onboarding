'use client';

import { RequireCap } from '@/components/guards';
import { SendForSignature } from '@/screens/SendForSignature';

export default function Page() {
  return <RequireCap cap="signed.upload"><SendForSignature /></RequireCap>;
}
