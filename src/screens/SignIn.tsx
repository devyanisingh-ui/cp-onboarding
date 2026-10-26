'use client';

import { useState } from 'react';
import { CheckCircle2, Clock, Eye, EyeOff, Lock, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useSession } from '@/context/SessionContext';
import { api } from '@/services/mockApi';
import { errorMessage } from '@/services/errors';
import { ROLE_LABELS } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/misc';
import { Alert, Avatar, Button, Field, Input } from '@/components/ui';
import { BrandName } from '@/components/layout/Brand';
import { DEMO_PASSWORD } from '@/data/seed';

export function SignIn() {
  useDocumentTitle('Sign in');
  const { signIn, endedReason } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const accounts = api.auth.demoAccounts();

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      // Signing in updates the session; the sign-in route then returns to the page that asked for it.
      await signIn(username, password);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
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

      <main className="flex items-center justify-center px-4 pb-10 pt-4 sm:px-8 lg:pt-5">
        <div className="surface w-full max-w-md rounded-2xl p-6 sm:p-8">
          <div className="mb-8 lg:hidden">
            <BrandName />
          </div>
          <h1 className="text-display">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Enter your CP Onboarding username and password.</p>
          {/* Shared prototype: make clear this is not a live Apeejay system. */}
          <p className="mt-4 rounded-lg border border-amber-200 bg-warning-50 px-3 py-2 text-xs font-medium text-amber-900">
            Prototype for review. Sign-in is simulated and all partners and agreements are fictional demo data. Do not use a real password.
          </p>

          {endedReason && (
            <Alert tone="info" className="mt-5" title={endedReason === 'timeout' ? 'You were signed out' : 'Session ended'}>
              {endedReason === 'timeout' ? 'We signed you out after 30 minutes of inactivity to keep partner data safe.' : 'Please sign in again to continue.'}
            </Alert>
          )}

          <form
            className="mt-6 space-y-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {error && <Alert tone="error">{error}</Alert>}
            <Field label="Username" hint="Usually the part of your work email before @, e.g. kavya.iyer">
              <Input
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                prefix={<UserIcon className="size-4" aria-hidden />}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>
            <Field
              label="Password"
              labelAction={
                <button type="button" className="flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline" onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              }
            >
              <Input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                prefix={<Lock className="size-4" aria-hidden />}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" size="lg" block loading={busy} disabled={!username.trim() || !password}>
              Sign in
            </Button>
          </form>

          <details className="mt-6 rounded-lg border border-line p-3 text-sm">
            <summary className="cursor-pointer font-medium text-ink">Demo accounts</summary>
            <p className="mt-2 text-xs text-muted">
              Every demo account uses the password <code className="rounded bg-sunken px-1 font-mono text-ink">{DEMO_PASSWORD}</code>. Pick one to fill the form.
            </p>
            <ul className="-mx-1 mt-2 space-y-0.5">
              {accounts.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setUsername(a.username);
                      setPassword(DEMO_PASSWORD);
                      setError(null);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left hover:bg-[var(--surface-hover)]"
                  >
                    <Avatar name={a.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{a.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {a.username} · {a.roles.map((r) => ROLE_LABELS[r]).join(', ')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </details>

          <div className="mt-8 space-y-2 rounded-lg bg-sunken/70 p-4 text-xs text-muted">
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-px size-3.5 shrink-0 text-primary-600" aria-hidden /> Only users set up by the central Admin team can sign in.
            </p>
            <p className="flex items-start gap-2">
              <Clock className="mt-px size-3.5 shrink-0 text-primary-600" aria-hidden /> Sessions end after 30 minutes of inactivity.
            </p>
          </div>
        </div>
      </main>

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
