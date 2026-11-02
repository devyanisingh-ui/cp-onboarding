'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, Lock, Mail, MessageSquareText, Smartphone } from 'lucide-react';
import { api, type ContactVerifySession } from '@/services/mockApi';
import { useAction, useApi } from '@/hooks/useApi';
import { useDocumentTitle } from '@/hooks/misc';
import { cn } from '@/lib/cn';
import { Alert, Button, Card, CardBody, ErrorState, Field, Input, PageSkeleton } from '@/components/ui';
import { BrandName } from '@/components/layout/Brand';

/**
 * The page a CP opens from their verification email: confirm the email, then the mobile with a
 * code sent by text. No app account: the link is their credential.
 */
export function ContactVerify() {
  const { token = '' } = useParams<{ token: string }>();
  useDocumentTitle('Verify your contact details');
  const { data, error, loading, reload } = useApi(() => api.verifyContact.session(token), [token]);

  return (
    <div className="min-h-dvh">
      <header className="glass-1 sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-white/70 px-4 sm:px-6 lg:px-10">
        <BrandName />
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <Lock className="size-3.5" aria-hidden /> Secure verification link
        </span>
      </header>
      <main id="main" className="mx-auto w-full max-w-xl px-4 pb-6 pt-4 sm:px-6 lg:pb-8 lg:pt-5">
        {loading && !data ? (
          <PageSkeleton />
        ) : error && !data ? (
          <ErrorState title="This verification link doesn’t work" error={error} onRetry={reload} />
        ) : (
          <VerifyView s={data!} token={token} reload={reload} />
        )}
      </main>
    </div>
  );
}

function VerifyView({ s, token, reload }: { s: ContactVerifySession; token: string; reload: () => void }) {
  const both = s.email === 'verified' && s.mobile === 'verified';
  return (
    <>
      <div className="mb-5">
        <p className="text-eyebrow text-primary-700">Channel Partner onboarding</p>
        <h1 className="text-display mt-1.5">{s.cpName}</h1>
        <p className="mt-1 text-sm text-muted">
          {s.contactPerson ? `Hello ${s.contactPerson}. ` : ''}Please confirm that Apeejay can reach you on this email and mobile. It takes a minute.
        </p>
      </div>

      {both ? (
        <Alert tone="success" title="Thank you — your email and mobile are verified">
          Your Apeejay contact has been told. You can close this page.
        </Alert>
      ) : s.expired ? (
        <Alert tone="warning" title="This link has expired">
          Ask your Apeejay contact to send you a new one.
        </Alert>
      ) : (
        <div className="space-y-4">
          <EmailStep s={s} token={token} done={reload} />
          <MobileStep s={s} token={token} done={reload} />
        </div>
      )}
    </>
  );
}

function Step({ n, icon, title, detail, verified, children }: { n: number; icon: React.ReactNode; title: string; detail: string; verified: boolean; children?: React.ReactNode }) {
  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-start gap-3">
          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-[18px]', verified ? 'bg-success-50 text-success-700' : 'bg-primary-50 text-primary-700')} aria-hidden>
            {verified ? <CheckCircle2 /> : icon}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Step {n}</p>
            <p className="font-semibold text-ink">{verified ? `${title} — verified` : title}</p>
            <p className="text-sm text-muted">{detail}</p>
          </div>
        </div>
        {!verified && children}
      </CardBody>
    </Card>
  );
}

function EmailStep({ s, token, done }: { s: ContactVerifySession; token: string; done: () => void }) {
  const confirm = useAction(() => api.verifyContact.confirmEmail(token), { success: 'Email verified', onSuccess: done });
  return (
    <Step n={1} icon={<Mail />} title="Confirm your email" detail={s.emailMasked} verified={s.email === 'verified'}>
      <Button loading={confirm.loading} onClick={() => void confirm.run()}>
        This is my email
      </Button>
    </Step>
  );
}

function MobileStep({ s, token, done }: { s: ContactVerifySession; token: string; done: () => void }) {
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(s.resendIn);
  const [sent, setSent] = useState(s.codeSent);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  const send = useAction(() => api.verifyContact.sendCode(token), {
    success: (r) => `Code sent to ${r.sentTo}`,
    onSuccess: () => {
      setSent(true);
      setWait(30);
      setCode('');
    },
  });
  const verify = useAction(() => api.verifyContact.verifyCode(token, code), { success: 'Mobile verified', onSuccess: done, silent: true });
  return (
    <Step n={2} icon={<Smartphone />} title="Confirm your mobile" detail={`+91 ${s.mobileMasked}`} verified={s.mobile === 'verified'}>
      {!sent ? (
        <Button icon={<MessageSquareText className="size-4" />} loading={send.loading} onClick={() => void send.run()}>
          Send me a code
        </Button>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void verify.run();
          }}
        >
          <Field label="6-digit code from the text message" error={verify.error ?? undefined}>
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="max-w-40 font-mono tracking-[0.3em]" autoFocus />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" loading={verify.loading} disabled={code.length !== 6}>
              Verify
            </Button>
            <Button type="button" variant="ghost" disabled={wait > 0} loading={send.loading} onClick={() => void send.run()}>
              {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
            </Button>
          </div>
        </form>
      )}
    </Step>
  );
}
