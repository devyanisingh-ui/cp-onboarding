import { useState } from 'react';
import { Mail, Play, RotateCcw, Send } from 'lucide-react';
import { api } from '@/services/mockApi';
import { getDb } from '@/services/db';
import { channels } from '@/services/notificationChannels';
import { useAction, useApi } from '@/hooks/useApi';
import { useSession } from '@/context/SessionContext';
import { useDocumentTitle } from '@/hooks/misc';
import { ROUTER_MODE } from '@/lib/runtime';
import { formatDateTime } from '@/lib/dates';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Modal, Toggle } from '@/components/ui';

export function System() {
  useDocumentTitle('System');
  const { can } = useSession();
  const emails = useApi(() => api.inbox.emails(), []);
  const [simulate, setSimulate] = useState(getDb().settings.simulateErrors);
  const [confirmReset, setConfirmReset] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const report = (r: Awaited<ReturnType<typeof api.system.runJobs>>) => `${r.reminders} reminders · ${r.escalations} escalations · ${r.renewalTasks} renewal tasks · ${r.statusChanges} status changes · ${r.digests} digests`;
  const jobs = useAction(() => api.system.runJobs(false), { success: (r) => `Jobs run: ${report(r)}` });
  const digest = useAction(() => api.system.runJobs(true), { success: (r) => `Digest sent to ${r.digests} user(s)` });
  const reset = useAction(() => api.system.reset(), { success: 'Demo data reset', onSuccess: () => (setConfirmReset(false), ROUTER_MODE === 'memory' ? window.location.reload() : window.location.assign(ROUTER_MODE === 'hash' ? `${window.location.pathname}#/` : '/')) });
  const manage = can('config.manage');

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Scheduled jobs" description="In production a scheduler runs these. Here they run on load, every minute, and on demand." />
        <CardBody className="space-y-4 text-sm">
          <ul className="list-disc space-y-1 pl-5 text-ink-soft">
            <li>SLA reminders when due, and escalations after the grace period</li>
            <li>Renewal decision tasks 60 days before expiry; escalation to the Approver at 30 days</li>
            <li>Expiry and end-of-notice status changes</li>
            <li>Daily digest at 9:00 AM IST for Approvers, Legal and Audit</li>
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

      <Card>
        <CardHeader title="Email outbox" description="Emails the app has sent (simulated)." icon={<Mail />} />
        {emails.data?.length ? (
          <ul className="max-h-[480px] divide-y divide-line overflow-y-auto">
            {emails.data.map((m) => (
              <li key={m.id}>
                <button type="button" className="w-full px-5 py-3 text-left hover:bg-[var(--surface-hover)]" onClick={() => setOpen(open === m.id ? null : m.id)} aria-expanded={open === m.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={m.kind === 'escalation' ? 'orange' : m.kind === 'digest' ? 'purple' : m.kind === 'reminder' ? 'amber' : 'accent'}>{m.kind}</Badge>
                    <span className="text-sm font-medium">{m.subject}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    To {m.to} · {formatDateTime(m.sentAt)}
                  </p>
                  {open === m.id && <pre className="mt-2 whitespace-pre-wrap rounded-md bg-canvas p-3 font-sans text-xs text-ink-soft">{m.body}{m.link ? `\n\nOpen: ${m.link}` : ''}</pre>}
                </button>
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
