import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Eraser, Mail, MailCheck, Play, RotateCcw, Send, XCircle } from 'lucide-react';
import { api } from '@/services/mockApi';
import { getDb } from '@/services/db';
import { channels } from '@/services/notificationChannels';
import { relayEnabled, relaySettings, sendTestEmail } from '@/services/emailRelay';
import { useAction, useApi } from '@/hooks/useApi';
import { useSession, useUser } from '@/context/SessionContext';
import { useDocumentTitle } from '@/hooks/misc';
import { ROUTER_MODE } from '@/lib/runtime';
import { formatDateTime } from '@/lib/dates';
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Modal, Toggle } from '@/components/ui';

export function System() {
  useDocumentTitle('System');
  const { can } = useSession();
  const emails = useApi(() => api.inbox.emails(), []);
  const [simulate, setSimulate] = useState(getDb().settings.simulateErrors);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const report = (r: Awaited<ReturnType<typeof api.system.runJobs>>) => `${r.reminders} reminders · ${r.escalations} escalations · ${r.renewalTasks} renewal tasks · ${r.statusChanges} status changes · ${r.digests} digests`;
  const jobs = useAction(() => api.system.runJobs(false), { success: (r) => `Jobs run: ${report(r)}` });
  const digest = useAction(() => api.system.runJobs(true), { success: (r) => `Digest sent to ${r.digests} user(s)` });
  const reset = useAction(() => api.system.reset(), { success: 'Demo data reset', onSuccess: () => (setConfirmReset(false), ROUTER_MODE === 'memory' ? window.location.reload() : window.location.assign(ROUTER_MODE === 'hash' ? `${window.location.pathname}#/` : '/')) });
  const clear = useAction(() => api.system.clearRecords(), { success: 'All records deleted', onSuccess: () => (setConfirmClear(false), ROUTER_MODE === 'memory' ? window.location.reload() : window.location.assign(ROUTER_MODE === 'hash' ? `${window.location.pathname}#/` : '/')) });
  const manage = can('config.manage');

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Scheduled jobs" description="In production a scheduler runs these. Here they run on load, every minute, and on demand." />
        <CardBody className="space-y-4 text-sm">
          <ul className="list-disc space-y-1 pl-5 text-ink-soft">
            <li>SLA reminders when due, and escalations after the grace period</li>
            <li>Renewal decision tasks 60 days before expiry; escalation to Admin at 30 days</li>
            <li>Expiry and end-of-notice status changes</li>
            <li>Daily digest at 9:00 AM IST for Legal and Admin</li>
          </ul>
          {manage && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={<Play className="size-4" />} loading={jobs.loading} onClick={() => void jobs.run()}>
                Run jobs now
              </Button>
              <Button variant="secondary" icon={<Send className="size-4" />} loading={digest.loading} onClick={() => void digest.run()}>
                Send daily digest now
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Notification channels" description="Pluggable. Notifications carry only CP name, agreement ID, action and link — never PAN, Aadhaar, bank details or rates." />
        <ul className="divide-y divide-line">
          <li className="flex items-center justify-between px-5 py-3 text-sm">
            In-app (inbox and bell) <Badge tone="green">Enabled</Badge>
          </li>
          {channels.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-5 py-3 text-sm">
              {c.label} <Badge tone={c.enabled ? 'green' : 'grey'}>{c.enabled ? 'Enabled' : 'Phase 2'}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <EmailCheck />

      <Card>
        <CardHeader title="Email outbox" description={relayEnabled() ? 'Emails the app has sent. Every one is delivered through Resend.' : 'Emails the app has sent (simulated).'} icon={<Mail />} />
        {emails.data?.length ? (
          <ul className="max-h-[480px] divide-y divide-line overflow-y-auto">
            {emails.data.map((m) => (
              <li key={m.id}>
                <button type="button" className="w-full px-5 py-3 text-left hover:bg-[var(--surface-hover)]" onClick={() => setOpen(open === m.id ? null : m.id)} aria-expanded={open === m.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={m.kind === 'escalation' ? 'orange' : m.kind === 'digest' ? 'purple' : m.kind === 'reminder' ? 'amber' : m.kind === 'signature' ? 'blue' : 'accent'}>{m.kind}</Badge>
                    <span className="text-sm font-medium">{m.subject}</span>
                    {m.delivery && <Badge tone={m.delivery.status === 'sent' ? 'green' : m.delivery.status === 'failed' ? 'red' : 'grey'}>{m.delivery.status === 'sent' ? 'Delivered to Resend' : m.delivery.status === 'failed' ? 'Not sent' : 'Sending…'}</Badge>}
                  </div>
                  {m.delivery?.status === 'failed' && <p className="mt-0.5 text-xs text-danger-700">{m.delivery.error}</p>}
                  <p className="mt-0.5 text-xs text-muted">
                    To {m.to} · {formatDateTime(m.sentAt)}
                  </p>
                  {open === m.id && <pre className="mt-2 whitespace-pre-wrap rounded-md bg-canvas p-3 font-sans text-xs text-ink-soft">{m.body}</pre>}
                </button>
                {open === m.id && m.link && (
                  <p className="px-5 pb-3 text-xs">
                    <Link to={m.link} className="hit-area font-medium text-primary-700 hover:underline">
                      {m.kind === 'signature' ? 'Open signing link' : 'Open link'} →
                    </Link>
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact icon={<Mail />} title="No emails yet" description="Emails appear here as tasks are created, reminders fall due and digests are sent." />
        )}
      </Card>

      {manage && (
        <Card>
          <CardHeader title="Prototype controls" description="For reviewing loading and error states." />
          <CardBody className="space-y-5">
            <Toggle
              checked={simulate}
              onChange={(v) => {
                setSimulate(v);
                void api.system.setSimulateErrors(v);
              }}
              label="Simulate network errors"
              description="About 30% of requests fail, so you can see error and retry states."
            />
            <div className="flex items-center justify-between gap-4 border-t border-line pt-4">
              <div className="text-sm">
                <p className="font-medium">Clear all records</p>
                <p className="text-muted">Deletes every CP, agreement, document, task, notification and audit event to test from scratch. Users, institutions, templates and rate cards stay.</p>
              </div>
              <Button variant="danger" icon={<Eraser className="size-4" />} onClick={() => setConfirmClear(true)}>
                Clear
              </Button>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-line pt-4">
              <div className="text-sm">
                <p className="font-medium">Reset demo data</p>
                <p className="text-muted">Restores the seed data and deletes files uploaded in this browser.</p>
              </div>
              <Button variant="danger" icon={<RotateCcw className="size-4" />} onClick={() => setConfirmReset(true)}>
                Reset
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Delete all records?"
        description="Every CP, agreement, deviation, uploaded document, task, notification, email and audit event in this browser is deleted, and numbering starts again from 1. Users, institutions, templates, rate cards and settings are kept. To get the sample data back later, use Reset demo data."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={clear.loading} onClick={() => void clear.run()}>
              Delete all records
            </Button>
          </>
        }
      />

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset demo data?"
        description="Everything created in this browser — CPs, agreements, uploads and audit events — will be replaced by the seed data."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={reset.loading} onClick={() => void reset.run()}>
              Reset data
            </Button>
          </>
        }
      />
    </div>
  );
}

type RelaySettings = Awaited<ReturnType<typeof relaySettings>>;
type TestResult = Awaited<ReturnType<typeof sendTestEmail>>;

/** Plain advice for the errors Resend and the relay give most often. */
function emailAdvice(error: string): string | undefined {
  if (/only send testing emails to your own email/i.test(error))
    return 'Resend’s test sender (onboarding@resend.dev) only delivers to the email you signed up to Resend with. Set EMAIL_REDIRECT_TO in .env to exactly that address, or verify a domain in Resend and send from it.';
  if (/api key is invalid|invalid api key|unauthor/i.test(error)) return 'RESEND_API_KEY in .env is wrong or was revoked. Create a new key on resend.com (API Keys) and restart the dev server.';
  if (/domain.*(not verified|verify)/i.test(error)) return 'EMAIL_FROM uses a domain that isn’t verified in Resend. Verify it there, or use onboarding@resend.dev while testing.';
  if (/could not reach resend|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed|timeout/i.test(error)) return 'The machine running the dev server can’t reach api.resend.com: no internet, or a firewall or proxy blocks it. Try another network.';
  if (/not configured/i.test(error)) return 'Fill in the missing values in .env, then stop and restart npm run dev.';
  return undefined;
}

/** Shows what the email relay can see of its settings and sends one test email, with Resend's answer. */
function EmailCheck() {
  const user = useUser();
  const [settings, setSettings] = useState<RelaySettings | null>(null);
  const [to, setTo] = useState(user.email);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  useEffect(() => {
    void relaySettings().then(setSettings);
  }, []);
  const send = async () => {
    setSending(true);
    setResult(await sendTestEmail(to.trim()));
    setSending(false);
  };
  const row = (ok: boolean, text: string) => (
    <li className="flex items-start gap-2 text-sm">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-600" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger-600" aria-hidden />}
      <span className={ok ? 'text-ink-soft' : 'text-danger-700'}>{text}</span>
    </li>
  );
  const advice = result && !result.ok ? emailAdvice(result.error) : undefined;
  return (
    <Card>
      <CardHeader title="Email delivery check" description="What the server can see of your .env, and one test email through Resend with its exact answer." icon={<MailCheck />} />
      <CardBody className="space-y-4">
        {!settings ? (
          <p className="text-sm text-muted">Checking the email settings…</p>
        ) : 'unreachable' in settings ? (
          <Alert tone="error" title="The email relay isn’t running here">
            {settings.unreachable}
          </Alert>
        ) : (
          <ul className="space-y-1.5" aria-label="Email settings">
            {row(relayEnabled(), relayEnabled() ? 'VITE_EMAIL_DELIVERY=resend: the app sends its emails through Resend.' : 'VITE_EMAIL_DELIVERY is not "resend": the app only fills the outbox. Add it to .env and restart npm run dev.')}
            {row(!settings.missing.length, settings.missing.length ? `Missing in .env: ${settings.missing.join(', ')}. Add ${settings.missing.length === 1 ? 'it' : 'them'} and restart npm run dev.` : `RESEND_API_KEY, EMAIL_FROM and APP_URL are set. Sending from ${settings.from}.`)}
            {settings.redirect ? row(true, `EMAIL_REDIRECT_TO is set: every email goes to ${settings.redirect}.`) : row(true, 'EMAIL_REDIRECT_TO is not set: each email goes to its real recipient.')}
          </ul>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Send a test email to" className="sm:w-80">
            <Input type="email" value={to} onChange={(e) => (setTo(e.target.value), setResult(null))} />
          </Field>
          <Button icon={<Send className="size-4" />} loading={sending} disabled={!to.trim()} onClick={() => void send()}>
            Send test email
          </Button>
        </div>
        {settings && !('unreachable' in settings) && settings.redirect && <p className="-mt-2 text-xs text-muted">EMAIL_REDIRECT_TO sends it to {settings.redirect} instead.</p>}
        {result &&
          (result.ok ? (
            <Alert tone="success" title="Resend accepted the test email">
              Resend id {result.id}. If it doesn’t arrive within a minute, look in Spam / Junk, and on the Emails page of your Resend account, which says whether it was delivered or bounced.
            </Alert>
          ) : (
            <Alert tone="error" title="Resend did not send it">
              <span className="font-medium">{result.error}</span>
              {advice && <span className="mt-1 block">{advice}</span>}
            </Alert>
          ))}
      </CardBody>
    </Card>
  );
}
