import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, CircleDashed, FileWarning, Pencil, Scale, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { DocumentRecord } from '@/types';
import { api } from '@/services/mockApi';
import { useAction, useApi } from '@/hooks/useApi';
import { useDocumentTitle } from '@/hooks/misc';
import { cn } from '@/lib/cn';
import { rejectionTitle } from '@/lib/status';
import { Alert, Badge, Button, ButtonLink, Card, CardHeader, Checkbox, ErrorState, Field, Modal, PageSkeleton, StatusBadge, Tabs, Textarea } from '@/components/ui';
import { ActionBar, AgreementHtml, CommentDialog, PageHeader, docLabel } from '@/components/common';
import { DeviationCompare, DownloadMenu } from '@/components/agreement';

export function DraftPreview() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const detail = useApi(() => api.agreements.get(id), [id]);
  const doc = useApi(() => api.agreements.render(id), [id]);
  const [rejecting, setRejecting] = useState(false);
  const [askingDocs, setAskingDocs] = useState(false);
  const [panel, setPanel] = useState<'fields' | 'deviations'>('fields');
  const [mobileView, setMobileView] = useState<'document' | 'details'>('document');
  useDocumentTitle(`Preview ${id}`);

  const submit = useAction(() => api.agreements.submit(id), { success: 'Ready for signing', onSuccess: () => navigate(`/agreements/${id}`) });
  const approve = useAction(() => api.agreements.decideGate1(id, 'approve'), { success: 'Approved — sent to Admin for final approval', onSuccess: () => navigate(`/agreements/${id}`) });
  const reject = useAction((c: string) => api.agreements.decideGate1(id, 'reject', c), { success: 'Returned to the BD Executive', onSuccess: () => navigate('/tasks') });

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
              <span className="hidden gap-2 md:flex">
                <Button variant="danger" icon={<ThumbsDown className="size-4" />} onClick={() => setRejecting(true)}>
                  Reject
                </Button>
                {act.requestDocChanges && (
                  <Button variant="secondary" icon={<FileWarning className="size-4" />} onClick={() => setAskingDocs(true)}>
                    Request document changes
                  </Button>
                )}
                <Button variant="success" icon={<ThumbsUp className="size-4" />} loading={approve.loading} onClick={() => void approve.run()}>
                  Approve & send to Admin
                </Button>
              </span>
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
            Check the merged terms, the CP’s KYC documents and any deviations{a.nonStandard ? ' (shown side by side)' : ''}. If a document is wrong, use Request document changes: the BD Executive gets the CP to re-upload it. Approving sends the signed agreement to Admin for final approval. Rejecting returns it to Draft, so it must be signed again.
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
              <DeviationCompare deviations={devs} names={d.names} />
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
            <>
              <Button variant="danger" icon={<ThumbsDown className="size-4" />} onClick={() => setRejecting(true)}>
                Reject
              </Button>
              {act.requestDocChanges && (
                <Button variant="secondary" icon={<FileWarning className="size-4" />} onClick={() => setAskingDocs(true)}>
                  Documents
                </Button>
              )}
              <Button variant="success" icon={<ThumbsUp className="size-4" />} loading={approve.loading} onClick={() => void approve.run()}>
                Approve
              </Button>
            </>
          )}
        </ActionBar>
      )}

      <CommentDialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Reject and return to BD Executive"
        description="The draft goes back to the BD Executive with your comment. A comment is mandatory."
        confirmLabel="Reject and return"
        onConfirm={async (c) => (await reject.run(c)).ok}
      />
      <DocChangesDialog open={askingDocs} onClose={() => setAskingDocs(false)} agreementId={a.id} docs={d.cpDocuments} onDone={() => navigate('/tasks')} />
    </div>
  );
}

/** Legal flags the CP documents that are wrong, with a remark on each, and sends them back. */
function DocChangesDialog({ open, onClose, agreementId, docs, onDone }: { open: boolean; onClose: () => void; agreementId: string; docs: DocumentRecord[]; onDone: () => void }) {
  // Newest upload of each document type (the list comes newest first).
  const latest = docs.filter((x, i) => docs.findIndex((y) => y.type === x.type) === i);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');
  const chosen = latest.filter((x) => picked[x.id]);
  const send = useAction(
    () => api.agreements.requestDocChanges(agreementId, chosen.map((x) => ({ documentId: x.id, remark: remarks[x.id] ?? '' })), note),
    { success: 'Sent back to the BD Executive', onSuccess: () => (onClose(), onDone()) },
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request document changes"
      description="Choose the documents the CP must correct and say what is wrong with each. The BD Executive sends the CP an upload link, checks the new files and sends the agreement back to you."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={send.loading} disabled={!chosen.length || chosen.some((x) => !remarks[x.id]?.trim())} onClick={() => void send.run()}>
            Send to BD Executive
          </Button>
        </>
      }
    >
      {latest.length ? (
        <ul className="space-y-4">
          {latest.map((x) => (
            <li key={x.id} className="rounded-lg border border-line p-3">
              <Checkbox label={docLabel(x.type)} description={x.fileName} checked={!!picked[x.id]} onChange={(e) => setPicked((p) => ({ ...p, [x.id]: e.target.checked }))} />
              {picked[x.id] && (
                <Field label="What needs to change" required className="mt-3">
                  <Textarea rows={2} value={remarks[x.id] ?? ''} placeholder="e.g. The PAN copy is blurred — upload a clear scan of the original." onChange={(e) => setRemarks((r) => ({ ...r, [x.id]: e.target.value }))} />
                </Field>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">This CP has no uploaded documents.</p>
      )}
      <Field label="Note for the BD Executive" optional className="mt-4">
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}
