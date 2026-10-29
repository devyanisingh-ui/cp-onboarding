'use client';

import { MailCheck, Send } from 'lucide-react';
import type { ContactCheck, ContactVerificationView } from '@/types';
import { api } from '@/services/mockApi';
import { useSession } from '@/context/SessionContext';
import { useAction } from '@/hooks/useApi';
import { formatDateTime } from '@/lib/dates';
import { Badge, Button, Card, CardHeader } from '@/components/ui';

const CHECK_META: Record<ContactCheck, { label: string; tone: 'green' | 'amber' | 'grey' }> = {
  verified: { label: 'Verified', tone: 'green' },
  pending: { label: 'Waiting for CP', tone: 'amber' },
  not_started: { label: 'Not started', tone: 'grey' },
};

/** "Verified" / "Waiting for CP" / "Not started" for one channel. */
export function ContactCheckBadge({ check }: { check: ContactCheck }) {
  return <Badge tone={CHECK_META[check].tone}>{CHECK_META[check].label}</Badge>;
}

/**
 * Whether the CP has confirmed their email (link) and mobile (code). It runs alongside Legal's
 * review and never holds the agreement up; BD Executives can send or resend the link.
 */
export function ContactVerificationCard({ cpId, email, mobile, contact, className }: { cpId: string; email: string; mobile: string; contact: ContactVerificationView; className?: string }) {
  const { can } = useSession();
  const both = contact.email === 'verified' && contact.mobile === 'verified';
  const send = useAction(() => api.cps.sendVerification(cpId), { success: `Verification link sent to ${email}` });
  const rows: { label: string; value: string; check: ContactCheck; at?: string }[] = [
    { label: 'Email', value: email, check: contact.email, at: contact.emailVerifiedAt },
    { label: 'Mobile', value: mobile ? `+91 ${mobile}` : '—', check: contact.mobile, at: contact.mobileVerifiedAt },
  ];
  return (
    <Card className={className}>
      <CardHeader title="Contact verification" description={both ? 'The CP confirmed both.' : 'The CP confirms their email (link) and mobile (code). It runs alongside Legal’s review.'} icon={<MailCheck />} />
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.label} className="flex items-start justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="text-xs text-muted">{r.label}</p>
              <p className="truncate text-sm font-medium text-ink">{r.value}</p>
              {r.at && <p className="mt-0.5 text-xs text-muted">{formatDateTime(r.at)}</p>}
            </div>
            <ContactCheckBadge check={r.check} />
          </li>
        ))}
      </ul>
      {!both && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3">
          <p className="text-xs text-muted">
            {contact.linkSentAt ? `Link sent ${formatDateTime(contact.linkSentAt)}${contact.linkExpired ? ' · expired' : ''}` : 'Starts by itself when the agreement goes to Legal.'}
          </p>
          {can('kyc.upload') && (
            <Button variant="secondary" size="sm" icon={<Send className="size-4" />} loading={send.loading} onClick={() => void send.run()}>
              {contact.linkSentAt ? 'Resend link' : 'Send link now'}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
