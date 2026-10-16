import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Clock, FileSignature, KeyRound, Lock, PenLine, ShieldCheck, Usb, XCircle } from 'lucide-react';
import type { DscCertificate } from '@/types';
import { api, SIGN_METHOD_LABELS, type SignatureInput, type SigningSession } from '@/services/mockApi';
import { useAction, useApi } from '@/hooks/useApi';
import { useDocumentTitle } from '@/hooks/misc';
import { formatDate, formatDateTime } from '@/lib/dates';
import { cn } from '@/lib/cn';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, ErrorState, Field, Input, PageSkeleton, Spinner, Tabs } from '@/components/ui';
import { AgreementHtml, CommentDialog } from '@/components/common';
import { BrandName } from '@/components/layout/Brand';
import { SCRIPT_FONT, SignaturePad, typedSignaturePng, type SignaturePadHandle } from '@/components/SignaturePad';

/**
 * The page a signer opens from their email link. No app account: the link is their credential.
 * Shows the agreement, then lets them sign by drawing/typing or with a DSC, or decline.
 */
export function Sign() {
  const { token = '' } = useParams();
  useDocumentTitle('Sign agreement');
  const { data, error, loading, reload } = useApi(() => api.signing.session(token), [token]);

  return (
    <div className="min-h-dvh">
      <header className="glass-1 sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-white/70 px-4 sm:px-6 lg:px-10">
        <BrandName />
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <Lock className="size-3.5" aria-hidden /> Secure signing link
        </span>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1400px] px-4 pb-6 pt-4 sm:px-6 lg:px-10 lg:pb-8 lg:pt-5">
        {loading && !data ? (
          <PageSkeleton />
        ) : error && !data ? (
          <ErrorState title="This signing link doesn’t work" error={error} onRetry={reload} />
        ) : (
          <SigningView s={data!} token={token} onDone={reload} />
        )}
      </main>
    </div>
  );
}

function SigningView({ s, token, onDone }: { s: SigningSession; token: string; onDone: () => void }) {
  const [declining, setDeclining] = useState(false);
  const decline = useAction((reason: string) => api.signing.decline(token, reason), { success: 'You declined to sign', onSuccess: onDone });
  const roleLabel = s.signer.role === 'cp' ? 'Channel Partner' : `${s.signer.designation ?? 'Signatory'}, for the institution`;

  return (
    <>
      <div className="mb-5">
        <p className="text-eyebrow text-primary-700">Channel Partner Agreement · {s.agreementId}</p>
        <h1 className="text-display mt-1.5">{s.cpName}</h1>
        <p className="mt-1 text-sm text-muted">
          With {s.institutionName}. You are signing as <span className="font-medium text-ink-soft">{s.signer.name}</span> ({roleLabel}).
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader title="Agreement" description="Read it in full before you sign." icon={<FileSignature />} />
          <div className="max-h-[75vh] overflow-y-auto px-5 py-6 sm:px-10">
            <AgreementHtml html={s.html} />
          </div>
        </Card>
        <aside className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Parties s={s} />
          {s.signer.status === 'signed' ? (
            <Alert tone="success" title="You’ve signed this agreement">
              Signed {formatDateTime(s.signer.signedAt)}.{' '}
              {s.requestStatus === 'completed' ? 'All parties have signed. Apeejay will share the signed copy with you.' : 'We’ll let the remaining signer know it’s their turn.'}
            </Alert>
          ) : s.signer.status === 'declined' ? (
            <Alert tone="error" title="You declined to sign">
              “{s.signer.declineReason}”. Apeejay has been told and will contact you.
            </Alert>
          ) : s.requestStatus !== 'in_progress' ? (
            <Alert tone="warning" title="This signing request is no longer active">
              {s.requestStatus === 'cancelled' ? 'Apeejay withdrew it. You don’t need to do anything.' : 'Another signer declined. Apeejay will send a new request if needed.'}
            </Alert>
          ) : !s.yourTurn ? (
            <Alert tone="info" title="Not your turn yet">
              {s.waitingFor ? `${s.waitingFor} signs first. ` : ''}You’ll get an email when it’s your turn.
            </Alert>
          ) : (
            <>
              {s.signer.method === 'dsc' ? <DscSign s={s} token={token} onDone={onDone} /> : <ElectronicSign s={s} token={token} onDone={onDone} />}
              <p className="px-1 text-center text-sm text-muted">
                Something wrong in the agreement?{' '}
                <button type="button" className="hit-area font-medium text-danger-700 underline-offset-2 hover:underline" onClick={() => setDeclining(true)}>
                  Decline to sign
                </button>
              </p>
            </>
          )}
        </aside>
      </div>
      <CommentDialog
        open={declining}
        onClose={() => setDeclining(false)}
        title="Decline to sign"
        description="Apeejay will be told, with your reason, and will follow up with you."
        confirmLabel="Decline"
        placeholder="What needs to change?"
        onConfirm={async (c) => (await decline.run(c)).ok}
      />
    </>
  );
}

function Parties({ s }: { s: SigningSession }) {
  return (
    <Card>
      <CardHeader title="Signing order" />
      <ol className="divide-y divide-line">
        {s.parties.map((p) => {
          const you = p.role === s.signer.role;
          return (
            <li key={p.role} className={cn('flex items-start gap-3 px-5 py-3 text-sm', you && 'bg-primary-50/50')}>
              <span className="mt-0.5">
                {p.status === 'signed' ? <CheckCircle2 className="size-5 text-success-600" aria-label="Signed" /> : p.status === 'declined' ? <XCircle className="size-5 text-danger-600" aria-label="Declined" /> : <Clock className={cn('size-5', p.status === 'sent' ? 'text-amber-600' : 'text-subtle')} aria-label={p.status === 'sent' ? 'Waiting to sign' : 'Not yet sent'} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">
                  {p.order}. {p.name}
                  {you && <span className="font-normal text-muted"> (you)</span>}
                </span>
                <span className="block text-xs text-muted">
                  {p.role === 'cp' ? 'Channel Partner' : (p.designation ?? 'Institution')} · {p.method === 'dsc' ? 'DSC' : 'Drawn or typed'}
                  {p.signedAt ? ` · signed ${formatDateTime(p.signedAt)}` : ''}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      {s.signEveryPage && <p className="border-t border-line px-5 py-3 text-xs text-muted">Signatures also appear at the foot of every page.</p>}
    </Card>
  );
}

function ElectronicSign({ s, token, onDone }: { s: SigningSession; token: string; onDone: () => void }) {
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typed, setTyped] = useState(s.signer.name);
  const [hasInk, setHasInk] = useState(false);
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pad = useRef<SignaturePadHandle>(null);
  const sign = useAction((input: SignatureInput) => api.signing.sign(token, input), {
    success: (r) => (r.completed ? 'Signed — all parties have now signed' : 'Signed — thank you'),
    onSuccess: onDone,
  });

  const submit = () => {
    setErr(null);
    if (mode === 'draw') {
      const image = pad.current?.toPng();
      if (!image) return setErr('Draw your signature in the box.');
      void sign.run({ kind: 'drawn', image, consent });
    } else {
      if (typed.trim().length < 2) return setErr('Type your full name.');
      void sign.run({ kind: 'typed', image: typedSignaturePng(typed.trim()), typedName: typed.trim(), consent });
    }
  };

  return (
    <Card>
      <CardHeader title="Your signature" description={SIGN_METHOD_LABELS.electronic} icon={<PenLine />} />
      <CardBody className="space-y-4">
        <Tabs
          label="Signature style"
          active={mode}
          onChange={setMode}
          tabs={[
            { id: 'draw', label: 'Draw' },
            { id: 'type', label: 'Type' },
          ]}
        />
        {mode === 'draw' ? (
          <SignaturePad ref={pad} onChange={setHasInk} />
        ) : (
          <div className="space-y-3">
            <Field label="Your full name" required>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="name" />
            </Field>
            <div className="flex h-24 items-center overflow-hidden rounded-lg border border-dashed border-line-strong bg-white px-5" aria-label="Signature preview">
              <span className="truncate text-4xl italic text-[#0f1a3a]" style={{ fontFamily: SCRIPT_FONT }}>
                {typed || ' '}
              </span>
            </div>
          </div>
        )}
        <Checkbox
          label="I agree to sign this agreement electronically"
          description="My electronic signature has the same effect as my handwritten signature. The time, my IP address and device are recorded."
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        {err && <p className="text-sm text-danger-700">{err}</p>}
        <Button className="w-full" icon={<FileSignature className="size-4" />} loading={sign.loading} disabled={!consent || (mode === 'draw' && !hasInk)} onClick={submit}>
          Sign agreement
        </Button>
      </CardBody>
    </Card>
  );
}

function DscSign({ s, token, onDone }: { s: SigningSession; token: string; onDone: () => void }) {
  const [stage, setStage] = useState<'connect' | 'detecting' | 'choose'>('connect');
  const [certId, setCertId] = useState<string>('');
  const [pin, setPin] = useState('');
  const sign = useAction(() => api.signing.sign(token, { kind: 'dsc', certificateId: certId, pin }), {
    success: (r) => (r.completed ? 'Signed with DSC — all parties have now signed' : 'Signed with DSC — thank you'),
    onSuccess: onDone,
  });
  const valid = (c: DscCertificate) => c.validTo >= new Date().toISOString().slice(0, 10);

  return (
    <Card>
      <CardHeader title="Sign with your DSC" description="Class 3 digital signature certificate on a USB token" icon={<KeyRound />} />
      <CardBody className="space-y-4">
        {stage !== 'choose' ? (
          <>
            <p className="text-sm text-muted">Insert your USB token, then connect. Your certificate never leaves the token; only the signature is sent.</p>
            <Button
              className="w-full"
              variant="secondary"
              icon={stage === 'detecting' ? undefined : <Usb className="size-4" />}
              disabled={stage === 'detecting'}
              onClick={() => {
                setStage('detecting');
                setTimeout(() => {
                  setStage('choose');
                  setCertId(s.certificates.find(valid)?.id ?? '');
                }, 900);
              }}
            >
              {stage === 'detecting' ? <Spinner label="Looking for your token" /> : 'Connect signing token'}
            </Button>
          </>
        ) : (
          <>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink">Certificates on your token</legend>
              <div className="space-y-2">
                {s.certificates.map((c) => {
                  const ok = valid(c);
                  return (
                    <label key={c.id} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm', certId === c.id ? 'border-primary-500 bg-primary-50/60 ring-1 ring-primary-500' : 'border-line', !ok && 'cursor-not-allowed opacity-60')}>
                      <input type="radio" name="cert" className="mt-1 accent-primary-600" checked={certId === c.id} disabled={!ok} onChange={() => setCertId(c.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 font-medium">
                          {c.subject} {ok ? <Badge tone="green">Valid</Badge> : <Badge tone="red">Expired</Badge>}
                        </span>
                        <span className="block text-xs text-muted">
                          {c.className} · {c.issuer}
                        </span>
                        <span className="block text-xs text-muted">
                          Serial {c.serial} · valid to {formatDate(c.validTo)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <Field label="Token PIN" required hint="Prototype: no real token is read — any 4–8 digit PIN works." error={sign.fieldErrors.pin}>
              <Input type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Button className="w-full" icon={<ShieldCheck className="size-4" />} loading={sign.loading} disabled={!certId || pin.length < 4} onClick={() => void sign.run()}>
              Sign with DSC
            </Button>
          </>
        )}
      </CardBody>
    </Card>
  );
}
