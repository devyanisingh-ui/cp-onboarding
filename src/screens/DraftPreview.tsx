'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, CircleDashed, Pencil, Scale, Send, ShieldCheck } from 'lucide-react';
import { api } from '@/services/mockApi';
import { useAction, useApi } from '@/hooks/useApi';
import { useDocumentTitle } from '@/hooks/misc';
import { cn } from '@/lib/cn';
import { rejectionTitle } from '@/lib/status';
import { Alert, Badge, Button, ButtonLink, Card, CardHeader, ErrorState, PageSkeleton, StatusBadge, Tabs } from '@/components/ui';
import { ActionBar, AgreementHtml, PageHeader } from '@/components/common';
import { DeviationCompare, DownloadMenu } from '@/components/agreement';

export function DraftPreview() {
  const { id = '' } = useParams<{ id: string }>();
  const router = useRouter();
  const detail = useApi(() => api.agreements.get(id), [id]);
  const doc = useApi(() => api.agreements.render(id), [id]);
  const [panel, setPanel] = useState<'fields' | 'deviations'>('fields');
  const [mobileView, setMobileView] = useState<'document' | 'details'>('document');
  useDocumentTitle(`Preview ${id}`);

  const submit = useAction(() => api.agreements.submit(id), { success: 'Ready for signing', onSuccess: () => router.push(`/agreements/${id}`) });

  if ((detail.loading && !detail.data) || (doc.loading && !doc.data)) return <PageSkeleton />;
  if (detail.error || doc.error) return <ErrorState error={detail.error ?? doc.error} onRetry={() => (detail.reload(), doc.reload())} />;
  const d = detail.data!;
  const r = doc.data!;
  const a = d.agreement;
  const act = d.actions;
  const devs = d.deviations.filter((x) => x.status !== 'rejected' || a.status === 'draft');

  return (
    <div>
      <PageHeader
        title="Draft preview"
        subtitle={`${d.cp.legalName} · ${d.institution.shortCode} · Template v${d.template.version} · Rate card v${d.rateCard.version}`}
        badges={
          <>
            <StatusBadge status={d.summary.displayStatus} />
            {a.nonStandard && <Badge tone="orange" icon={<Scale className="size-3" aria-hidden />}>Non-standard</Badge>}
          </>
        }
        actions={
          <>
            {act.approveGate1 && (
              <ButtonLink to={`/agreements/${a.id}/legal-review`} className="max-md:hidden" icon={<ShieldCheck className="size-4" />}>
                Open review checklist
              </ButtonLink>
            )}
            {act.submit && (
              <Button className="max-md:hidden" icon={<Send className="size-4" />} loading={submit.loading} disabled={r.blockers.length > 0} onClick={() => void submit.run()}>
                Finalise for signing
              </Button>
            )}
            <DownloadMenu agreementId={a.id} html={r.html} />
            {act.edit && (
              <ButtonLink to={`/agreements/${a.id}/edit?step=3`} variant="secondary" icon={<Pencil className="size-4" />}>
                Edit
              </ButtonLink>
            )}
            {act.requestDeviation && (
              <ButtonLink to={`/agreements/${a.id}/deviation`} variant="secondary" icon={<Scale className="size-4" />}>
                Request deviation
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="mb-5 space-y-3">
        {a.lastRejection && a.status === 'draft' && (
          <Alert tone="error" title={`${rejectionTitle(a.lastRejection.gate)} (${d.names[a.lastRejection.byId]})`}>
            {a.lastRejection.comment}
          </Alert>
        )}
        {act.approveGate1 && (
          <Alert tone="info" title="Legal review">
            Read the merged terms and any deviations{a.nonStandard ? ' (shown side by side)' : ''} here, then open the review checklist to check the signed copy and the CP’s documents. From the checklist you approve (on to Admin), request corrected documents from the CP, or reject.
          </Alert>
        )}
        {a.status === 'draft' && r.blockers.length > 0 && (
          <Alert tone="warning" title="Submission blocked">
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {r.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </Alert>
        )}
      </div>

      <div className="mb-4 lg:hidden">
        <Tabs label="Preview sections" active={mobileView} onChange={setMobileView} tabs={[{ id: 'document', label: 'Document' }, { id: 'details', label: 'Fields & deviations', count: r.missing.length || undefined }]} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className={cn('min-w-0', mobileView !== 'document' && 'hidden lg:block')}>
          <div className="print-area rounded-xl border border-white bg-white p-5 shadow-[var(--shadow-raised)] sm:p-10">
            <AgreementHtml html={r.html} />
          </div>
        </div>

        <aside className={cn('min-w-0 space-y-5 lg:sticky lg:top-[7.5rem] lg:self-start', mobileView !== 'details' && 'hidden lg:block')}>
          <Card>
            <div className="px-5 pt-2">
              <Tabs
                label="Summary panel"
                active={panel}
                onChange={setPanel}
                tabs={[
                  { id: 'fields', label: 'Fields', count: r.missing.length || undefined },
                  { id: 'deviations', label: 'Deviations', count: devs.length || undefined },
                ]}
              />
            </div>
            {panel === 'fields' ? (
              <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
                {r.fields.map((f) => (
                  <li key={f.key} className={cn('flex items-start gap-2.5 px-5 py-2.5', !f.value && f.required && 'bg-amber-50')}>
                    {f.value ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-600" aria-hidden /> : f.required ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden /> : <CircleDashed className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />}
                    <div className="min-w-0">
                      <p className="text-xs text-muted">
                        {f.label} · <span className="text-subtle">{f.source}</span>
                      </p>
                      <p className={cn('break-words text-sm', f.value ? 'text-ink' : 'font-medium text-amber-800')}>{f.value || (f.required ? 'Missing' : 'Not applicable')}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : devs.length ? (
              <DeviationCompare deviations={devs} names={d.names} docs={d.documents} />
            ) : (
              <p className="px-5 py-6 text-sm text-muted">Standard terms — no deviations on this agreement.</p>
            )}
          </Card>
          {d.openTasks.length > 0 && (
            <Card>
              <CardHeader title="Waiting on" />
              <ul className="divide-y divide-line">
                {d.openTasks.map((t) => (
                  <li key={t.id} className="px-5 py-3 text-sm">
                    <p className="font-medium">{t.title}</p>
                    <p className="text-xs text-muted">{t.assigneeName}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>

      {(act.submit || act.approveGate1) && (
        <ActionBar className="md:hidden">
          {act.submit && (
            <Button icon={<Send className="size-4" />} loading={submit.loading} disabled={r.blockers.length > 0} onClick={() => void submit.run()}>
              Finalise for signing
            </Button>
          )}
          {act.approveGate1 && (
            <ButtonLink to={`/agreements/${a.id}/legal-review`} icon={<ShieldCheck className="size-4" />}>
              Open review checklist
            </ButtonLink>
          )}
        </ActionBar>
      )}

    </div>
  );
}
