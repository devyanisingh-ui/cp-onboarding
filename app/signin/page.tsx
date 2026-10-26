'use client';

import { SignedOutOnly } from '@/components/guards';
import { SignIn } from '@/screens/SignIn';

export default function Page() {
  return (
    <SignedOutOnly>
      <SignIn />
    </SignedOutOnly>
  );
}
