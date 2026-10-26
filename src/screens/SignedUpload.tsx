'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { UploadCloud } from 'lucide-react';
import { api } from '@/services/mockApi';
import { errorMessage } from '@/services/errors';
import { useApi } from '@/hooks/useApi';
import { useDocumentTitle } from '@/hooks/misc';
import { stampPaperSchema } from '@/lib/schemas';
import { getDb } from '@/services/db';
import { combineToPdf } from '@/lib/pdf';
import { today } from '@/lib/dates';
import { Alert, Button, Card, CardBody, CardHeader, ErrorState, Field, Input, PageSkeleton, Select, useToast } from '@/components/ui';
import { ActionBar, FileDrop, PageHeader } from '@/components/common';

const schema = stampPaperSchema;
type Values = z.infer<typeof schema>;

export function SignedUpload() {
  const { id = '' } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useApi(() => api.agreements.get(id), [id]);
  const lists = getDb().masterLists;
  const [signed, setSigned] = useState<File[]>([]);
  const [stamp, setStamp] = useState<File[]>([]);
  const [fileErr, setFileErr] = useState<{ signed?: string; stamp?: string }>({});
  const [busy, setBusy] = useState(false);
  useDocumentTitle(`Upload signed copy ${id}`);
  const a = data?.agreement;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: a
      ? {
          number: a.stampPaper?.number ?? '',
          valueInr: a.stampPaper?.valueInr ?? 100,
          purchaseDate: a.stampPaper?.purchaseDate ?? '',
          state: a.stampPaper?.state ?? data!.institution.state,
          vendor: a.stampPaper?.vendor ?? '',
        }
      : undefined,
  });

  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const d = data!;
  if (!d.actions.uploadSigned)
    return <ErrorState title="Nothing to upload" error={new Error('This agreement is not waiting for a signed copy, or your role cannot upload it.')} />;

  const e = form.formState.errors;

  const submit = form.handleSubmit(async (v) => {
    const fe: typeof fileErr = {};
    if (!signed.length) fe.signed = 'Upload the scanned signed agreement';
    if (!stamp.length) fe.stamp = 'Upload the stamp paper scan';
    setFileErr(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      const s = await combineToPdf(signed, `Signed_${d.agreement.id}`);
      const st = await combineToPdf(stamp, `Stamp_${d.agreement.id}`);
      await api.agreements.uploadSigned(d.agreement.id, {
        stampPaper: { number: v.number, valueInr: v.valueInr, purchaseDate: v.purchaseDate, state: v.state, vendor: v.vendor },
        signedFile: s.blob,
        signedFileName: s.fileName,
        stampFile: st.blob,
        stampFileName: st.fileName,
      });
      toast.success('Signed copy uploaded', d.agreement.source === 'legacy' ? 'Sent to Admin for Gate 2 verification.' : 'Sent to Legal for review.');
      router.push(`/agreements/${d.agreement.id}`);
    } catch (err) {
      toast.error('Upload failed', errorMessage(err));
    } finally {
      setBusy(false);
    }
  });

  return (
    <div>
      <PageHeader
        title={d.agreement.source === 'legacy' ? 'Upload legacy scan' : 'Upload signed copy'}
        subtitle={`${d.cp.legalName} · ${d.institution.shortCode}`}
      />
      {d.agreement.lastRejection?.gate === 2 && (
        <Alert tone="error" className="mb-5" title="Admin returned the previous upload">
          {d.agreement.lastRejection.comment}
        </Alert>
      )}
      <form onSubmit={submit} noValidate className="space-y-5">
        <Card>
          <CardHeader title="Stamp paper" description="Mandatory. Enter it exactly as printed." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Stamp paper number" required error={e.number?.message}>
              <Input {...form.register('number')} className="font-mono uppercase" />
            </Field>
            <Field label="Value (INR)" required error={e.valueInr?.message}>
              <Input type="number" min={1} {...form.register('valueInr')} />
            </Field>
            <Field label="Purchase date" required error={e.purchaseDate?.message}>
              <Input type="date" max={today()} {...form.register('purchaseDate')} />
            </Field>
            <Field label="State" required error={e.state?.message}>
              <Select {...form.register('state')} value={form.watch('state') ?? ''}>
                <option value="">Choose a state</option>
                {lists.stampStates.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="Vendor" required error={e.vendor?.message} className="sm:col-span-2">
              <Input {...form.register('vendor')} />
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Scans" description="Upload one PDF, or photograph each page — photos are combined into a single PDF." />
          <CardBody className="grid gap-5 md:grid-cols-2">
            <FileDrop
              label="Signed agreement"
              required
              multiple
              files={signed}
              error={fileErr.signed}
              onFiles={(f) => setSigned((s) => [...s, ...f])}
              onRemove={(i) => setSigned((s) => s.filter((_, j) => j !== i))}
              hint="All pages, in order"
            />
            <FileDrop
              label="Stamp paper scan"
              required
              multiple
              files={stamp}
              error={fileErr.stamp}
              onFiles={(f) => setStamp((s) => [...s, ...f])}
              onRemove={(i) => setStamp((s) => s.filter((_, j) => j !== i))}
            />
          </CardBody>
        </Card>
        <ActionBar>
          <Button type="submit" icon={<UploadCloud className="size-4" />} loading={busy}>
            Upload and send for verification
          </Button>
        </ActionBar>
      </form>
    </div>
  );
}
