import { useState } from 'react';
import { ArrowRight, Download, FileDown, Printer } from 'lucide-react';
import type { Deviation } from '@/types';
import { api } from '@/services/mockApi';
import { errorMessage } from '@/services/errors';
import { formatInr } from '@/lib/format';
import { formatShortDate } from '@/lib/dates';
import { downloadBlob, printAgreement } from '@/lib/download';
import { cn } from '@/lib/cn';
import { Badge, Button, Menu, useToast } from '@/components/ui';

/** Side-by-side standard vs agreed values (PRD §6.2, screen 7). */
export function DeviationCompare({ deviations, names }: { deviations: Deviation[]; names: Record<string, string> }) {
  if (!deviations.length) return null;
  return (
    <ul className="divide-y divide-line">
      {deviations.map((d) => {
        const fmt = (v?: string) => (d.type === 'rate' ? formatInr(Number(v)) : v);
        const agreed = d.status === 'approved' ? d.agreedValue : d.proposedValue;
        return (
          <li key={d.id} className="px-5 py-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-ink">{d.label}</p>
              <Badge tone={d.status === 'approved' ? 'green' : d.status === 'rejected' ? 'red' : 'amber'}>
                {d.status === 'approved' ? 'Approved by Legal' : d.status === 'rejected' ? 'Rejected — standard applies' : 'Awaiting Legal'}
              </Badge>
            </div>
            <div className={cn('grid items-stretch gap-2', d.type === 'rate' ? 'grid-cols-[1fr_auto_1fr]' : 'sm:grid-cols-[1fr_auto_1fr]')}>
              <div className="rounded-lg border border-line bg-canvas p-3">
                <p className="text-2xs font-semibold uppercase tracking-wider text-muted">Standard</p>
                <p className={cn('mt-1 text-ink-soft', d.type === 'rate' ? 'text-base font-semibold tabular-nums' : 'text-sm')}>{fmt(d.standardValue)}</p>
              </div>
              <ArrowRight className={cn('size-4 self-center text-subtle', d.type === 'clause' && 'hidden sm:block')} aria-hidden />
              <div className={cn('rounded-lg border p-3', d.status === 'rejected' ? 'border-line bg-canvas opacity-60' : 'border-orange-200 bg-orange-50')}>
                <p className="text-2xs font-semibold uppercase tracking-wider text-orange-800">{d.status === 'approved' ? 'Agreed' : 'Proposed'}</p>
                <p className={cn('mt-1 text-ink', d.type === 'rate' ? 'text-base font-semibold tabular-nums' : 'text-sm', d.status === 'rejected' && 'line-through')}>{fmt(agreed)}</p>
                {d.status === 'approved' && d.agreedValue !== d.proposedValue && <p className="mt-1 text-xs text-muted">Requested {fmt(d.proposedValue)}</p>}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">
              <span className="font-medium text-ink-soft">Reason:</span> {d.reason} — {names[d.requestedById] ?? '—'}, {formatShortDate(d.requestedAt)}
            </p>
            {d.legalComment && (
              <p className="mt-1 text-xs text-muted">
                <span className="font-medium text-ink-soft">Legal:</span> {d.legalComment} — {names[d.decidedById ?? ''] ?? '—'}, {formatShortDate(d.decidedAt)}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function DownloadMenu({ agreementId, html }: { agreementId: string; html?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (format: 'docx' | 'pdf') => {
    setBusy(true);
    try {
      const res = await api.agreements.download(agreementId, format);
      if (format === 'docx') {
        downloadBlob(res.content, res.fileName, 'application/msword');
        toast.success('DOCX downloaded', 'Opens in Word for Legal review.');
      } else {
        const body = html ?? (await api.agreements.render(agreementId)).html;
        printAgreement(body, agreementId);
      }
    } catch (e) {
      toast.error('Download failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Menu
      label="Download"
      trigger={(p) => (
        <Button {...p} variant="secondary" loading={busy} icon={<Download className="size-4" />}>
          Download
        </Button>
      )}
      items={[
        { label: 'PDF — for printing on stamp paper', icon: <Printer />, onSelect: () => void run('pdf') },
        { label: 'DOCX — for Legal', icon: <FileDown />, onSelect: () => void run('docx') },
      ]}
    />
  );
}
