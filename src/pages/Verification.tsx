import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, ShieldCheck, ThumbsDown, X } from 'lucide-react';
import type { FieldCheck } from '@/types';
import { api } from '@/services/mockApi';
import { useAction, useApi } from '@/hooks/useApi';
import { useDocumentTitle } from '@/hooks/misc';
import { formatDate } from '@/lib/dates';
import { formatInr } from '@/lib/format';
import { maskAadhaar } from '@/lib/mask';
import { cn } from '@/lib/cn';
import { Alert, Button, Card, ErrorState, Input, PageSkeleton, Tabs } from '@/components/ui';
import { ActionBar, AgreementHtml, CommentDialog, DocumentFrame, MaskedValue, PageHeader, docLabel } from '@/components/common';

export function Verification() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const detail = useApi(() => api.agreements.get(id), [id]);
  const doc = useApi(() => api.agreements.render(id), [id]);
  const [checks, setChecks] = useState<Record<string, FieldCheck>>({});
  const [docTab, setDocTab] = useState('');
  const [rejecting, setRejecting] = useState(false);
  // Phones: document and checklist are tabs instead of a long stacked page.
  const [mobileView, setMobileView] = useState<'checks' | 'doc'>('checks');
  useDocumentTitle(`Gate 2 ${id}`);
  const approve = useAction(() => api.agreements.decideGate2(id, 'approve', checks), { success: 'Verified — agreement is now Active', onSuccess: () => navigate(`/agreements/${id}`) });
  const reject = useAction((c: string) => api.agreements.decideGate2(id, 'reject', checks, c), { success: 'Returned to the BD Executive', onSuccess: () => navigate('/tasks') });

  const d = detail.data;
  const fields = useMemo(() => {
    if (!d) return [];
    const a = d.agreement;
    const sp = a.stampPaper;
    const rows: { key: string; label: string; value: ReactNode }[] = [
      { key: 'pages_signed', label: 'Every page signed by both parties', value: 'Check each page' },
      { key: 'cp_name', label: 'CP name in signature block', value: d.cp.legalName },
      { key: 'signatory', label: 'Institution signatory', value: `${a.signatoryName}, ${a.signatoryDesignation}` },
      { key: 'stamp_number', label: 'Stamp paper number', value: sp?.number ?? '—' },
      { key: 'stamp_value', label: 'Stamp value and state', value: sp ? `${formatInr(sp.valueInr)} · ${sp.state}` : '—' },
      { key: 'stamp_date', label: 'Stamp purchase date', value: formatDate(sp?.purchaseDate) },
      { key: 'dates', label: 'Commencement and expiry', value: `${formatDate(a.startDate)} – ${formatDate(a.endDate)}` },
      { key: 'pan', label: 'PAN matches PAN copy', value: <MaskedValue masked={d.cp.panMasked} label="PAN" reveal={() => api.cps.reveal(d.cp.id, 'pan')} /> },
      { key: 'aadhaar', label: 'Aadhaar copy is masked; last 4 match', value: maskAadhaar(d.cp.aadhaarLast4) },
      { key: 'bank', label: 'Bank details match cancelled cheque', value: <MaskedValue masked={`${d.cp.bank.accountMasked} · ${d.cp.bank.ifsc}`} label="account number" reveal={async () => `${await api.cps.reveal(d.cp.id, 'account')} · ${d.cp.bank.ifsc}`} /> },
    ];
    return rows;
  }, [d]);

  if ((detail.loading && !d) || (doc.loading && !doc.data)) return <PageSkeleton />;
  if (detail.error || doc.error) return <ErrorState error={detail.error ?? doc.error} onRetry={() => (detail.reload(), doc.reload())} />;
  if (!d!.actions.verifyGate2) return <ErrorState title="Not ready for Gate 2" error={new Error('This agreement is not waiting for Gate 2 verification, or you are not in the Audit role.')} />;
  const docs = [...d!.documents.filter((x) => x.type === 'signed_copy' || x.type === 'stamp_paper_scan'), ...d!.cpDocuments];
  const current = docs.find((x) => x.id === docTab) ?? docs[0];
  const set = (key: string, v: Partial<FieldCheck>) => setChecks((c) => ({ ...c, [key]: { ...(c[key] ?? { status: 'verified' }), ...v } as FieldCheck }));
  const done = fields.filter((f) => checks[f.key]?.status === 'verified').length;
  const mismatches = fields.filter((f) => checks[f.key]?.status === 'mismatch').length;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Agreements', to: '/agreements' }, { label: d!.agreement.id, to: `/agreements/${d!.agreement.id}` }, { label: 'Gate 2' }]}
        title="Gate 2 verification"
        subtitle={`${d!.cp.legalName} · ${d!.institution.shortCode}${d!.agreement.source === 'legacy' ? ' · Legacy import' : ''}`}
      />
      <div className="mb-4 lg:hidden">
        <Tabs
          label="Gate 2 sections"
          active={mobileView}
          onChange={setMobileView}
          tabs={[
            { id: 'checks', label: `Checks ${done}/${fields.length}` },
            { id: 'doc', label: 'Documents', count: docs.length },
          ]}
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className={cn('min-w-0 overflow-hidden lg:sticky lg:top-20 lg:self-start', mobileView !== 'doc' && 'max-lg:hidden')}>
          <div className="px-4 pt-2">
            <Tabs label="Uploaded documents" active={current?.id ?? ''} onChange={setDocTab} tabs={docs.map((x) => ({ id: x.id, label: docLabel(x.type) }))} />
          </div>
          <div className="max-h-[75vh] overflow-y-auto bg-sunken p-3">
            {current && (
              <DocumentFrame
                key={current.id}
                doc={current}
                specimen={
                  current.type === 'signed_copy' ? (
                    <div className="relative rounded-md bg-white p-6 shadow-card">
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-5xl font-black uppercase tracking-widest text-slate-200/80 [transform:rotate(-24deg)]" aria-hidden>
                        Specimen scan
                      </span>
                      <AgreementHtml html={doc.data!.html} />
                    </div>
                  ) : undefined
                }
              />
            )}
          </div>
        </Card>

        <div className="min-w-0 space-y-4">
          <div className={cn('space-y-4', mobileView !== 'checks' && 'max-lg:hidden')}>
          <Alert tone="info">
            Mark each item. Approve needs every item Verified; any Mismatch means you reject with comments. {done}/{fields.length} verified{mismatches ? `, ${mismatches} mismatch` : ''}.
          </Alert>
          <Card>
            <ul className="divide-y divide-line">
              {fields.map((f) => {
                const c = checks[f.key];
                return (
                  <li key={f.key} className={cn('px-5 py-3.5', c?.status === 'mismatch' && 'bg-danger-50/50')}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-muted">{f.label}</p>
                        <p className="mt-0.5 text-sm font-medium text-ink">{f.value}</p>
                      </div>
                      <div className="flex rounded-md border border-line-strong p-0.5" role="group" aria-label={`${f.label} result`}>
                        <button
                          type="button"
                          aria-pressed={c?.status === 'verified'}
                          onClick={() => set(f.key, { status: 'verified' })}
                          className={cn('flex items-center gap-1 rounded px-3 py-2.5 text-xs font-semibold sm:px-2.5 sm:py-1', c?.status === 'verified' ? 'bg-success-600 text-white' : 'text-ink-soft hover:bg-[var(--surface-hover)]')}
                        >
                          <Check className="size-3.5" aria-hidden /> Verified
                        </button>
                        <button
                          type="button"
                          aria-pressed={c?.status === 'mismatch'}
                          onClick={() => set(f.key, { status: 'mismatch' })}
                          className={cn('flex items-center gap-1 rounded px-3 py-2.5 text-xs font-semibold sm:px-2.5 sm:py-1', c?.status === 'mismatch' ? 'bg-danger-600 text-white' : 'text-ink-soft hover:bg-[var(--surface-hover)]')}
                        >
                          <X className="size-3.5" aria-hidden /> Mismatch
                        </button>
                      </div>
                    </div>
                    {c && (
                      <Input className="mt-2 h-9" aria-label={`Remarks for ${f.label}`} placeholder={c.status === 'mismatch' ? 'What doesn’t match?' : 'Remarks (optional)'} value={c.remark ?? ''} onChange={(e) => set(f.key, { remark: e.target.value })} />
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
          </div>
          <ActionBar>
            <Button variant="danger" icon={<ThumbsDown className="size-4" />} onClick={() => setRejecting(true)}>
              Reject
            </Button>
            <Button variant="success" icon={<ShieldCheck className="size-4" />} disabled={done !== fields.length} loading={approve.loading} onClick={() => void approve.run()}>
              Approve — make Active
            </Button>
          </ActionBar>
        </div>
      </div>
      <CommentDialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Reject at Gate 2"
        description="The BD Executive must fix and re-upload. Your field remarks are saved with the comment."
        confirmLabel="Reject and return"
        onConfirm={async (c) => (await reject.run(c)).ok}
      />
    </div>
  );
}
