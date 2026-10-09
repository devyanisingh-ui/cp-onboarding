import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Camera,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  Lock,
  Trash2,
  Upload,
  XCircle,
  AlertTriangle,
  Circle,
} from 'lucide-react';
import type { AuditEvent, DocumentRecord } from '@/types';
import { api } from '@/services/mockApi';
import { errorMessage } from '@/services/errors';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { formatDate, formatDateTime, timeAgo } from '@/lib/dates';
import { STEPPER } from '@/lib/status';
import { saveFile } from '@/lib/download';
import type { AgreementStatus } from '@/types';
import { Badge, Breadcrumbs, Button, Field, IconButton, Modal, Spinner, Textarea, useToast } from '@/components/ui';
import { DOC_CSS } from '@/lib/agreementTemplate';

// ---------- Page header ----------

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  badges,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumbs?: { label: string; to?: string }[];
  actions?: ReactNode;
  badges?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] leading-tight sm:text-[26px]">{title}</h1>
            {badges}
          </div>
          {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
        </div>
        {actions && (
          // Phones: buttons fill each row evenly, and filled (primary/decision) buttons come first at full width.
          <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:max-w-[62%] sm:justify-end max-sm:[&>*]:grow max-sm:[&>div>button]:w-full max-sm:[&>.bg-gradient-to-b]:order-first max-sm:[&>.bg-gradient-to-b]:basis-full">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

/** PRD §8: the primary action per screen is fixed at the bottom on phones. */
export function ActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'glass-3 safe-bottom fixed inset-x-0 bottom-16 z-20 flex gap-2 border-t border-white/80 px-4 py-3 shadow-[0_-8px_24px_-14px_rgb(22_28_56/0.2)] md:static md:bg-transparent md:shadow-none md:backdrop-blur-none md:z-auto md:mt-6 md:justify-end md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none [&>*]:flex-1 md:[&>*]:flex-none',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---------- Masked values ----------

export function MaskedValue({ masked, reveal, label }: { masked: string; reveal: () => Promise<string>; label: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const toggle = async () => {
    if (value) return setValue(null);
    setLoading(true);
    try {
      setValue(await reveal());
    } catch (e) {
      toast.error('Could not reveal', errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-[13px] tracking-wide">{value ?? masked}</span>
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        className="hit-area inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-semibold text-primary-700 hover:bg-primary-50"
        aria-label={value ? `Hide ${label}` : `Reveal ${label} (this is logged)`}
        title={value ? 'Hide' : 'Reveal — this action is logged'}
      >
        {loading ? <Spinner label="" /> : value ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        {value ? 'Hide' : 'Reveal'}
      </button>
    </span>
  );
}

// ---------- File input with camera capture ----------

export function FileDrop({
  label,
  hint,
  accept = 'application/pdf,image/*',
  multiple,
  onFiles,
  files,
  onRemove,
  error,
  required,
  camera = true,
  disabled,
}: {
  label: string;
  hint?: string;
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  files?: { name: string; size: number }[];
  onRemove?: (i: number) => void;
  error?: string;
  required?: boolean;
  camera?: boolean;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const cam = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const pick = (list: FileList | null) => list && list.length && onFiles([...list]);
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-danger-600" aria-hidden>*</span>}
      </p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!disabled) pick(e.dataTransfer.files);
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors',
          drag ? 'border-primary-500 bg-primary-50' : error ? 'border-danger-600 bg-danger-50/40' : 'border-line-strong bg-canvas/50',
          disabled && 'opacity-60',
        )}
      >
        <Upload className="size-6 text-subtle" aria-hidden />
        <p className="text-sm text-muted">
          <span className="hidden sm:inline">Drag a file here or </span>
          <button type="button" disabled={disabled} className="hit-area font-semibold text-primary-700 hover:underline" onClick={() => input.current?.click()}>
            {multiple ? 'choose files' : 'choose a file'}
          </button>
          {camera && (
            <>
              {' '}
              or{' '}
              <button type="button" disabled={disabled} className="hit-area inline-flex items-center gap-1 font-semibold text-primary-700 hover:underline" onClick={() => cam.current?.click()}>
                <Camera className="size-3.5" aria-hidden /> take a photo
              </button>
            </>
          )}
        </p>
        {hint && <p className="text-xs text-subtle">{hint}</p>}
        <input ref={input} type="file" className="sr-only" tabIndex={-1} accept={accept} multiple={multiple} aria-label={label} onChange={(e) => (pick(e.target.files), (e.target.value = ''))} />
        {camera && <input ref={cam} type="file" className="sr-only" tabIndex={-1} accept="image/*" capture="environment" aria-label={`${label} (camera)`} onChange={(e) => (pick(e.target.files), (e.target.value = ''))} />}
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-danger-700">
          {error}
        </p>
      )}
      {files && files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex animate-fade-in items-center gap-2.5 rounded-lg border border-line/80 bg-white/80 px-3 py-2 text-sm">
              {/\.(png|jpe?g|webp|heic)$/i.test(f.name) ? <ImageIcon className="size-4 text-muted" aria-hidden /> : <FileText className="size-4 text-muted" aria-hidden />}
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="text-xs text-subtle">{formatBytes(f.size)}</span>
              {onRemove && (
                <IconButton label={`Remove ${f.name}`} size="sm" onClick={() => onRemove(i)}>
                  <XCircle className="size-4" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Documents ----------

const DOC_LABELS: Record<string, string> = {
  pan: 'PAN card',
  aadhaar_masked: 'Aadhaar (masked)',
  cancelled_cheque: 'Cancelled cheque',
  gst_certificate: 'GST certificate',
  draft: 'Draft agreement',
  signed_copy: 'Signed agreement',
  stamp_paper_scan: 'Stamp paper scan',
  termination_notice: 'Termination notice',
  template_docx: 'Template DOCX',
  other: 'Other',
};
export const docLabel = (t: string) => DOC_LABELS[t] ?? t;

export function VerificationBadge({ status }: { status: DocumentRecord['verificationStatus'] }) {
  if (status === 'verified')
    return (
      <Badge tone="green" icon={<CheckCircle2 className="size-3" aria-hidden />}>
        Verified
      </Badge>
    );
  if (status === 'mismatch')
    return (
      <Badge tone="red" icon={<XCircle className="size-3" aria-hidden />}>
        Mismatch
      </Badge>
    );
  return (
    <Badge tone="amber" icon={<Clock className="size-3" aria-hidden />}>
      Pending check
    </Badge>
  );
}

export function DocumentList({ docs, names, onVerify, empty = 'No documents uploaded yet.' }: { docs: DocumentRecord[]; names: Record<string, string>; onVerify?: (d: DocumentRecord) => void; empty?: string }) {
  const [viewing, setViewing] = useState<DocumentRecord | null>(null);
  const toast = useToast();
  const download = async (d: DocumentRecord) => {
    try {
      const res = await api.documents.open(d.id, 'download');
      if (!res.url) return toast.info('Sample record', 'Seed documents have no file attached in this prototype. The download was still logged.');
      await saveFile(await (await fetch(res.url)).blob(), d.fileName);
    } catch (e) {
      toast.error('Download failed', errorMessage(e));
    }
  };
  const remove = async (d: DocumentRecord) => {
    try {
      await api.documents.remove(d.id);
    } catch (e) {
      toast.error('Cannot delete', errorMessage(e));
    }
  };
  if (!docs.length) return <p className="px-5 py-6 text-sm text-muted">{empty}</p>;
  return (
    <>
      <ul className="divide-y divide-line">
        {docs.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-muted">
              {d.mimeType.startsWith('image/') ? <ImageIcon className="size-4" aria-hidden /> : <FileText className="size-4" aria-hidden />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{docLabel(d.type)}</p>
              <p className="truncate text-xs text-muted">
                {d.fileName} · {formatBytes(d.size)} · {names[d.uploadedById] ?? '—'}, {timeAgo(d.uploadedAt)}
              </p>
              {d.verifiedById && (
                <p className="text-xs text-muted">
                  {d.verificationStatus === 'verified' ? 'Verified' : 'Checked'} by {names[d.verifiedById] ?? 'Admin'} on {formatDate(d.verifiedOn?.slice(0, 10))} · {d.verificationMethod ?? 'manual'}
                  {d.remarks ? ` · “${d.remarks}”` : ''}
                </p>
              )}
            </div>
            <VerificationBadge status={d.verificationStatus} />
            <div className="flex items-center">
              <IconButton label={`View ${docLabel(d.type)}`} size="sm" onClick={() => setViewing(d)}>
                <Eye className="size-4" />
              </IconButton>
              <IconButton label={`Download ${docLabel(d.type)}`} size="sm" onClick={() => void download(d)}>
                <Download className="size-4" />
              </IconButton>
              {onVerify && (
                <IconButton label={`Verify ${docLabel(d.type)}`} size="sm" onClick={() => onVerify(d)}>
                  <CheckCircle2 className="size-4" />
                </IconButton>
              )}
              <IconButton label={`Delete ${docLabel(d.type)} (retention locked)`} size="sm" onClick={() => void remove(d)}>
                <Trash2 className="size-4" />
              </IconButton>
            </div>
            {d.retentionUntil && (
              <p className="flex w-full items-center gap-1 pl-12 text-2xs text-subtle">
                <Lock className="size-3" aria-hidden /> Retained until {formatDate(d.retentionUntil)}
              </p>
            )}
          </li>
        ))}
      </ul>
      <DocumentViewer doc={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

/** Opens a short-lived link (logged). Seed records render a specimen placeholder. */
export function DocumentViewer({ doc, onClose }: { doc: DocumentRecord | null; onClose: () => void }) {
  return (
    <Modal open={!!doc} onClose={onClose} title={doc ? docLabel(doc.type) : ''} description={doc?.fileName} size="lg">
      {doc && <DocumentFrame doc={doc} />}
    </Modal>
  );
}

export function DocumentFrame({ doc, specimen }: { doc: DocumentRecord; specimen?: ReactNode }) {
  const [state, setState] = useState<{ url: string | null; loaded: boolean; error?: string }>({ url: null, loaded: false });
  useEffect(() => {
    let alive = true;
    setState({ url: null, loaded: false });
    api.documents
      .open(doc.id, 'view')
      .then((r) => alive && setState({ url: r.url, loaded: true }))
      .catch((e) => alive && setState({ url: null, loaded: true, error: errorMessage(e) }));
    return () => {
      alive = false;
    };
  }, [doc.id]);
  if (!state.loaded) return <div className="flex h-64 items-center justify-center"><Spinner label="Opening secure link" /></div>;
  if (state.error) return <p className="text-sm text-danger-700">{state.error}</p>;
  if (!state.url)
    return (
      specimen ?? (
        <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-canvas text-center">
          <FileText className="size-10 text-subtle" aria-hidden />
          <p className="text-sm font-semibold text-ink">{docLabel(doc.type)} — specimen</p>
          <p className="max-w-xs text-xs text-muted">Seed records carry metadata only. Files you upload in this session open here through a 5-minute link.</p>
        </div>
      )
    );
  if (doc.mimeType.startsWith('image/')) return <img src={state.url} alt={docLabel(doc.type)} className="mx-auto max-h-[70vh] rounded-md" />;
  if (doc.mimeType === 'application/pdf') return <iframe src={state.url} title={doc.fileName} className="h-[70vh] w-full rounded-md border border-line" />;
  const url = state.url;
  return (
    <button type="button" onClick={() => void fetch(url).then((r) => r.blob()).then((b) => saveFile(b, doc.fileName))} className="text-sm font-semibold text-primary-700 underline">
      Download {doc.fileName}
    </button>
  );
}

export function AgreementHtml({ html, className }: { html: string; className?: string }) {
  return (
    <div className={className}>
      <style>{DOC_CSS}</style>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

// ---------- Timeline ----------

const ACTION_TONE: Record<string, string> = {
  approve: 'bg-success-600',
  verify: 'bg-success-600',
  reject: 'bg-danger-600',
  mismatch: 'bg-danger-600',
  escalate: 'bg-orange-500',
  reveal: 'bg-purple-500',
  download: 'bg-blue-500',
  view: 'bg-blue-400',
};

export function Timeline({ events, limit }: { events: AuditEvent[]; limit?: number }) {
  const [all, setAll] = useState(false);
  const shown = limit && !all ? events.slice(0, limit) : events;
  if (!events.length) return <p className="px-5 py-6 text-sm text-muted">No events yet.</p>;
  return (
    <div className="px-5 py-4">
      <ol className="relative space-y-4 border-l border-line pl-5">
        {shown.map((e) => (
          <li key={e.id} className="relative">
            <span className={cn('absolute -left-[25px] top-1.5 size-2.5 rounded-full ring-4 ring-white', ACTION_TONE[e.action] ?? 'bg-subtle')} aria-hidden />
            <p className="text-sm text-ink">{e.summary}</p>
            <p className="mt-0.5 text-xs text-muted">
              {e.actorName} · <time dateTime={e.at}>{formatDateTime(e.at)}</time>
            </p>
          </li>
        ))}
      </ol>
      {limit && events.length > limit && (
        <button type="button" className="mt-3 text-sm font-semibold text-primary-700 hover:underline" onClick={() => setAll((v) => !v)}>
          {all ? 'Show less' : `Show all ${events.length} events`}
        </button>
      )}
    </div>
  );
}

// ---------- Status stepper ----------

export function StatusStepper({ status, nonStandard }: { status: AgreementStatus; nonStandard?: boolean }) {
  // Standard agreements skip Legal approval, so that step is only shown for non-standard ones.
  const steps = nonStandard ? STEPPER : STEPPER.filter((s) => s.status !== 'pending_approval');
  const idx = steps.findIndex((s) => s.status === status);
  const past = idx === -1; // beyond Active (notice, terminated, expired…)
  const step = past ? steps.length : idx + 1;
  const next = !past && idx + 1 < steps.length ? steps[idx + 1]!.label : null;
  return (
    <>
    {/* Phones: compact segmented progress instead of stacked rows. */}
    <div className="sm:hidden" role="group" aria-label="Agreement progress">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-ink">{past ? 'Completed' : steps[idx]!.label}</p>
        <p className="shrink-0 text-xs font-medium text-muted">
          Step {step} of {steps.length}
        </p>
      </div>
      <div className="mt-2.5 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-hidden>
        {steps.map((st, i) => (
          <span key={st.status} className={cn('h-1.5 rounded-full', past || i < idx ? 'bg-primary-600' : i === idx ? 'bg-primary-400' : 'bg-ink/[0.08]')} />
        ))}
      </div>
      {next && <p className="mt-2 text-xs text-muted">Next: {next}</p>}
    </div>
    <ol className="hidden sm:flex sm:flex-row sm:items-center" aria-label="Agreement progress">
      {steps.map((s, i) => {
        const done = past || i < idx;
        const current = i === idx;
        return (
          <li key={s.status} className="flex items-center sm:flex-1 sm:last:flex-none">
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full ring-2',
                  done && 'bg-primary-600 text-white ring-primary-600',
                  current && 'bg-white text-primary-700 ring-primary-600',
                  !done && !current && 'bg-white text-subtle ring-line-strong',
                )}
              >
                {done ? <CheckCircle2 className="size-4" aria-hidden /> : current ? <Circle className="size-3 fill-current" aria-hidden /> : <span className="text-xs font-bold">{i + 1}</span>}
              </span>
              <span className={cn('text-sm', current ? 'font-semibold text-ink' : done ? 'text-ink-soft' : 'text-muted')}>
                {s.label}
                <span className="sr-only">{done ? ' (done)' : current ? ' (current)' : ''}</span>
              </span>
            </span>
            {i < steps.length - 1 && <span className={cn('mx-3 hidden h-0.5 flex-1 rounded sm:block', done ? 'bg-primary-600' : 'bg-line')} aria-hidden />}
          </li>
        );
      })}
    </ol>
    </>
  );
}

// ---------- Comment dialog (mandatory comment on rejection) ----------

export function CommentDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  onConfirm,
  tone = 'danger',
  required = true,
  placeholder = 'Explain what needs to change…',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  confirmLabel: string;
  onConfirm: (comment: string) => Promise<unknown>;
  tone?: 'danger' | 'primary';
  required?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (required && text.trim().length < 5) return setErr('A comment of at least 5 characters is required.');
    setBusy(true);
    try {
      const r = await onConfirm(text.trim());
      if (r !== false) {
        setText('');
        setErr(undefined);
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy} onClick={submit}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Field label={required ? 'Comment' : 'Comment'} required={required} optional={!required} error={err}>
        <Textarea data-autofocus rows={4} value={text} placeholder={placeholder} onChange={(e) => (setText(e.target.value), setErr(undefined))} />
      </Field>
    </Modal>
  );
}

export function WarningBanner({ reason, children }: { reason: string; children?: ReactNode }) {
  return (
    <div role="alert" className="flex gap-3 rounded-lg border border-red-300 bg-danger-50 p-3.5 text-sm text-red-900">
      <AlertTriangle className="size-5 shrink-0 text-danger-600" aria-hidden />
      <div>
        <p className="font-semibold">Warning flag on this CP</p>
        <p className="mt-0.5">{reason}</p>
        {children}
      </div>
    </div>
  );
}

export function AgreementLink({ id, className }: { id: string; className?: string }) {
  return (
    <Link to={`/agreements/${id}`} className={cn('font-mono text-[13px] font-medium text-primary-700 hover:underline', className)}>
      {id}
    </Link>
  );
}
