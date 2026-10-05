import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, ShieldCheck } from 'lucide-react';
import { useSession } from '@/context/SessionContext';
import { api } from '@/services/mockApi';
import { errorMessage } from '@/services/errors';
import { ROLE_LABELS } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/misc';
import { Alert, Avatar, Button, Field, Input, Modal } from '@/components/ui';
import { BrandName } from '@/components/layout/Brand';
import type { SsoProvider } from '@/services/api/session';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8Z" />
      <path fill="#34A853" d="M12 23c3 0 5.4-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1-3.7 1-2.8 0-5.2-1.9-6.1-4.5H2.3v2.8A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.9 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.3a11 11 0 0 0 0 9.8l3.6-2.8Z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.1 1.6l3.1-3.1A11 11 0 0 0 2.3 7.1l3.6 2.8C6.8 7.3 9.2 5.4 12 5.4Z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
      <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
      <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
      <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
    </svg>
  );
}

export function SignIn() {
  useDocumentTitle('Sign in');
  const { signIn, endedReason } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [provider, setProvider] = useState<SsoProvider | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const accounts = api.auth.demoAccounts();

  const go = async (value: string) => {
    if (!provider) return;
    setBusy(value);
    setError(null);
    try {
      await signIn(provider, value);
      setProvider(null);
      navigate(from, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-primary-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Decor />
        <div className="relative flex items-center gap-2.5">
          <span className="rounded-xl bg-white p-1.5">
            <BrandName collapsed />
          </span>
          <span className="text-lg font-bold">CP Onboarding</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight text-white">Every Channel Partner agreement, in one place.</h2>
          <p className="mt-3 text-primary-100">Create, approve, sign, verify and renew agreements across all Apeejay institutions — with a full audit trail.</p>
          <ul className="mt-8 space-y-3 text-sm">
            {['Legal-vetted templates — no retyped clauses', 'Two approval gates with SLAs and escalation', 'Reminders 60 days before every expiry'].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <CheckCircle2 className="size-5 text-amber-300" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-primary-200">Apeejay Education Society · Internal use only</p>
      </div>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="surface w-full max-w-md rounded-2xl p-6 sm:p-8">
          <div className="mb-8 lg:hidden">
            <BrandName />
          </div>
          <h1 className="text-display">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Use your Apeejay work account. There are no separate app passwords.</p>
          {/* Shared prototype: make clear this is not a live Apeejay system. */}
          <p className="mt-4 rounded-lg border border-amber-200 bg-warning-50 px-3 py-2 text-xs font-medium text-amber-900">
            Prototype for review. Sign-in is simulated, no password is ever asked for, and all partners and agreements are fictional demo data.
          </p>

          {endedReason && (
            <Alert tone="info" className="mt-5" title={endedReason === 'timeout' ? 'You were signed out' : 'Session ended'}>
              {endedReason === 'timeout' ? 'We signed you out after 30 minutes of inactivity to keep partner data safe.' : 'Please sign in again to continue.'}
            </Alert>
          )}

          <div className="mt-6 space-y-3">
            <Button variant="secondary" size="lg" block icon={<GoogleIcon />} onClick={() => (setProvider('google'), setError(null))}>
              Sign in with Google
            </Button>
            <Button variant="secondary" size="lg" block icon={<MicrosoftIcon />} onClick={() => (setProvider('microsoft'), setError(null))}>
              Sign in with Microsoft
            </Button>
          </div>

          <div className="mt-8 space-y-2 rounded-lg bg-sunken/70 p-4 text-xs text-muted">
            <p className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary-600" aria-hidden /> Only Admin-approved Apeejay domains can sign in.
            </p>
            <p className="flex items-center gap-2">
              <Clock className="size-4 text-primary-600" aria-hidden /> Sessions end after 30 minutes of inactivity.
            </p>
          </div>
        </div>
      </main>

      <Modal
        open={!!provider}
        onClose={() => setProvider(null)}
        title={`Choose an account`}
        description={`Continue to CP Onboarding with ${provider === 'google' ? 'Google' : 'Microsoft'} (simulated sign-in for this prototype)`}
      >
        {error && (
          <Alert tone="error" className="mb-4">
            {error}
          </Alert>
        )}
        <ul className="-mx-2 max-h-72 space-y-0.5 overflow-y-auto">
          {accounts.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => void go(a.email)}
                disabled={!!busy}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-[var(--surface-hover)] disabled:opacity-60"
              >
                <Avatar name={a.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{a.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {a.email} · {a.roles.map((r) => ROLE_LABELS[r]).join(', ')}
                  </span>
                </span>
                {busy === a.email && <span className="text-xs text-muted">Signing in…</span>}
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-4 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void go(email);
          }}
        >
          <Field label="Use another account" hint="Try a non-Apeejay address to see the domain check.">
            <Input type="email" autoComplete="email" placeholder="name@apeejay.edu" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" className="mt-3" block loading={busy === email && !!email} disabled={!email}>
            Continue
          </Button>
        </form>
      </Modal>
    </div>
  );
}

function Decor() {
  return (
    <svg className="absolute inset-0 h-full w-full opacity-[0.12]" aria-hidden>
      <defs>
        <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.6" fill="#fff" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dots)" />
      <circle cx="85%" cy="18%" r="160" fill="#fff" opacity="0.4" />
      <circle cx="10%" cy="90%" r="220" fill="#fff" opacity="0.25" />
    </svg>
  );
}
