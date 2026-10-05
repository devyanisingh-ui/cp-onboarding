import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Eye, FilePlus2, FileText, Pencil, Upload, X } from 'lucide-react';
import type { CpType } from '@/types';
import { api } from '@/services/mockApi';
import { useAction, useApi } from '@/hooks/useApi';
import { useSession } from '@/context/SessionContext';
import { useDocumentTitle } from '@/hooks/misc';
import { formatDate, today } from '@/lib/dates';
import { CP_TYPE_LABELS, CP_TYPES } from '@/lib/format';
import { VERSION_STATUS_META } from '@/lib/status';
import { cn } from '@/lib/cn';
import { Alert, Badge, Button, Card, CardHeader, ErrorState, Field, Input, Modal, PageSkeleton, Select, Textarea } from '@/components/ui';
import { CommentDialog, FileDrop } from '@/components/common';

export function Templates() {
  useDocumentTitle('Templates');
  const { can, user } = useSession();
  const [params] = useSearchParams();
  const highlight = params.get('id');
  const { data, error, loading, reload } = useApi(() => api.config.templates(), []);
  const lookups = useApi(() => api.config.lookups(), []);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const approve = useAction((id: string) => api.config.decideTemplate(id, 'approve'), { success: 'Template approved — Admin can publish' });
  const reject = useAction((id: string, c: string) => api.config.decideTemplate(id, 'reject', c), { success: 'Template rejected' });
  const publish = useAction((id: string) => api.config.publishTemplate(id), { success: 'Published — new drafts will use this version' });
  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const names = Object.fromEntries((lookups.data?.users ?? []).map((u) => [u.id, u.name]));
  const insts = lookups.data?.institutions ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">One template per CP type. Build new versions in the editor; Legal approves, Admin publishes. Old versions are never edited, and existing agreements keep their version.</p>
        {can('template.manage') && (
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" icon={<Upload className="size-4" />} onClick={() => setUploading(true)}>
              Upload DOCX
            </Button>
            <Button icon={<FilePlus2 className="size-4" />} onClick={() => setCreating(true)}>
              New version
            </Button>
          </div>
        )}
      </div>
      <Alert tone="warning" title="Template fixes before go-live">
        Remove the stray “Name of the Individual” signature block (Sole Proprietorship) · share the Pvt. Ltd, Partnership and Individual templates · confirm school-version clauses.
      </Alert>
      {CP_TYPES.map((t) => {
        const versions = data!.filter((x) => x.cpType === t);
        return (
          <Card key={t}>
            <CardHeader title={CP_TYPE_LABELS[t]} icon={<FileText />} />
            <ul className="divide-y divide-line">
              {versions.map((v) => (
                <li key={v.id} className={cn('flex flex-wrap items-center gap-3 px-5 py-3.5', highlight === v.id && 'bg-primary-50/60')}>
                  <span className="w-10 font-semibold">v{v.version}</span>
                  <Badge tone={VERSION_STATUS_META[v.status].tone}>{v.status === 'draft' && v.rejectComment ? 'Returned by Legal' : VERSION_STATUS_META[v.status].label}</Badge>
                  <div className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere] max-sm:order-3 max-sm:basis-full">
                    <p className="truncate text-ink">{v.changeNote || <span className="text-muted">No change note yet</span>}</p>
                    <p className="text-xs text-muted">
                      {v.fileName} · {v.institutionId ? insts.find((i) => i.id === v.institutionId)?.shortCode : 'All institutions'} · effective {formatDate(v.effectiveFrom)} · uploaded by {names[v.uploadedById] ?? '—'}
                      {v.rejectComment && ` · Legal: “${v.rejectComment}”`}
                    </p>
                  </div>
                  <div className="flex gap-2 max-sm:order-4 max-sm:basis-full max-sm:[&>*]:flex-1">
                    <Link
                      to={`/admin/templates/${v.id}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong/80 bg-white/80 px-3 text-[13px] font-semibold text-ink shadow-xs transition-colors hover:bg-white hover:border-subtle/70"
                    >
                      {v.status === 'draft' && can('template.manage') ? <Pencil className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                      {v.status === 'draft' && can('template.manage') ? 'Edit' : 'View'}
                    </Link>
                    {v.status === 'pending_approval' && can('template.approve') && (
                      <>
                        <Button size="sm" variant="danger" icon={<X className="size-4" />} onClick={() => setRejecting(v.id)}>
                          Reject
                        </Button>
                        <Button size="sm" variant="success" icon={<Check className="size-4" />} disabled={v.uploadedById === user?.id} loading={approve.loading} onClick={() => void approve.run(v.id)}>
                          Approve
                        </Button>
                      </>
                    )}
                    {v.status === 'approved' && can('template.manage') && (
                      <Button size="sm" loading={publish.loading} onClick={() => void publish.run(v.id)}>
                        Publish
                      </Button>
                    )}
                    {v.status === 'pending_approval' && !can('template.approve') && <span className="text-xs text-muted">Awaiting Legal</span>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
      {uploading && <UploadModal insts={insts} onClose={() => setUploading(false)} />}
      {creating && <NewVersionModal insts={insts} onClose={() => setCreating(false)} />}
      <CommentDialog open={!!rejecting} onClose={() => setRejecting(null)} title="Reject template" confirmLabel="Reject" onConfirm={async (c) => (await reject.run(rejecting!, c)).ok} />
    </div>
  );
}

function UploadModal({ insts, onClose }: { insts: { id: string; shortCode: string }[]; onClose: () => void }) {
  const [cpType, setCpType] = useState<CpType>('sole_prop');
  const [scope, setScope] = useState('');
  const [effective, setEffective] = useState(today());
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File[]>([]);
  const up = useAction(() => api.config.uploadTemplate({ cpType, institutionId: scope || null, effectiveFrom: effective, changeNote: note, file: file[0]!, fileName: file[0]!.name }), {
    success: 'Uploaded and sent to Legal',
    onSuccess: onClose,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Upload template version"
      description="Upload the Legal-vetted DOCX with merge fields. Legal approves before you can publish."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={up.loading} disabled={!file.length || !note.trim()} onClick={() => void up.run()}>
            Upload and send to Legal
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="CP type" required>
            <Select value={cpType} onChange={(e) => setCpType(e.target.value as CpType)}>
              {CP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CP_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Institution scope">
            <Select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="">All institutions</option>
              {insts.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.shortCode} only
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Effective from" required>
            <Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
          </Field>
        </div>
        <Field label="What changed" required>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <FileDrop label="Template file (.docx)" required camera={false} accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" files={file} onFiles={(f) => setFile(f.slice(0, 1))} onRemove={() => setFile([])} />
      </div>
    </Modal>
  );
}

function NewVersionModal({ insts, onClose }: { insts: { id: string; shortCode: string }[]; onClose: () => void }) {
  const navigate = useNavigate();
  const [cpType, setCpType] = useState<CpType>('sole_prop');
  const [scope, setScope] = useState('');
  const create = useAction(() => api.config.createTemplateDraft(cpType, scope || null), {
    success: 'Draft version created',
    onSuccess: (t) => navigate(`/admin/templates/${t.id}`),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="New template version"
      description="Starts a draft copied from the latest version, which you can edit in the template editor."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={create.loading} onClick={() => void create.run()}>
            Open editor
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="CP type" required>
          <Select value={cpType} onChange={(e) => setCpType(e.target.value as CpType)}>
            {CP_TYPES.map((t) => (
              <option key={t} value={t}>
                {CP_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Applies to">
          <Select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">All institutions</option>
            {insts.map((i) => (
              <option key={i.id} value={i.id}>
                {i.shortCode} only
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
