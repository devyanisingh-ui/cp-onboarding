'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, FileWarning, Lock, Send } from 'lucide-react';
import type { DocumentType } from '@/types';
import { api, type CpDocSession } from '@/services/mockApi';
import { errorMessage } from '@/services/errors';
import { useAction, useApi } from '@/hooks/useApi';
import { useDocumentTitle } from '@/hooks/misc';
import { combineToPdf } from '@/lib/pdf';
import { Alert, Button, Card, CardBody, CardHeader, ErrorState, Field, PageSkeleton, Textarea, useToast } from '@/components/ui';
import { FileDrop } from '@/components/common';
import { BrandName } from '@/components/layout/Brand';

/**
 * The page a CP opens from their email link to re-upload documents Apeejay's Legal team flagged.
 * No app account: the link is their credential.
 */
export function CpDocuments() {
  const { token = '' } = useParams<{ token: string }>();
  useDocumentTitle('Upload corrected documents');
  const { data, error, loading, reload } = useApi(() => api.cpDocs.session(token), [token]);

  return (
    <div className="min-h-dvh">
      <header className="glass-1 sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-white/70 px-4 sm:px-6 lg:px-10">
        <BrandName />
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <Lock className="size-3.5" aria-hidden /> Secure upload link
        </span>
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl px-4 pb-6 pt-4 sm:px-6 lg:pb-8 lg:pt-5">
        {loading && !data ? (
          <PageSkeleton />
        ) : error && !data ? (
          <ErrorState title="This upload link doesn’t work" error={error} onRetry={reload} />
        ) : (
          <UploadView s={data!} token={token} />
        )}
      </main>
    </div>
  );
}

function UploadView({ s, token }: { s: CpDocSession; token: string }) {
  const [note, setNote] = useState('');
  const submit = useAction(() => api.cpDocs.submit(token, note), { success: 'Documents sent to Apeejay' });
  const done = s.items.every((it) => it.uploadedFileName);

  return (
    <>
      <div className="mb-5">
        <p className="text-eyebrow text-primary-700">Channel Partner Agreement · {s.agreementId}</p>
        <h1 className="text-display mt-1.5">{s.cpName}</h1>
        <p className="mt-1 text-sm text-muted">With {s.institutionName}. Apeejay’s Legal team needs the documents below corrected.</p>
      </div>

      {!s.open ? (
        <Alert tone={s.status === 'cp_submitted' || s.status === 'closed' ? 'success' : 'info'} title={s.status === 'cp_submitted' || s.status === 'closed' ? 'Thank you — your documents were sent' : 'This link is not active'}>
          {s.status === 'cp_submitted' || s.status === 'closed'
            ? 'Your Apeejay contact will check them and continue with the agreement. You can close this page.'
            : 'Ask your Apeejay contact to send you a new link.'}
        </Alert>
      ) : (
        <div className="space-y-5">
          {s.note && (
            <Alert tone="info" title="Note from Apeejay">
              {s.note}
            </Alert>
          )}
          {s.items.map((it) => (
            <DocItem key={it.documentType} token={token} item={it} />
          ))}
          <Card>
            <CardBody className="space-y-4">
              <Field label="Message for your Apeejay contact" optional>
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <Button icon={<Send className="size-4" />} loading={submit.loading} disabled={!done} onClick={() => void submit.run()}>
                Send corrected documents
              </Button>
              {!done && <p className="text-sm text-muted">Upload every document above to send them.</p>}
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}

function DocItem({ token, item }: { token: string; item: CpDocSession['items'][number] }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const upload = async (files: File[]) => {
    setBusy(true);
    setErr(undefined);
    try {
      const f = await combineToPdf(files, `${item.documentType}`);
      await api.cpDocs.upload(token, item.documentType as DocumentType, f.blob, f.fileName);
      toast.success(`${item.label} uploaded`);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader title={item.label} description={item.previousFileName ? `Previously uploaded: ${item.previousFileName}` : undefined} icon={<FileWarning />} />
      <CardBody className="space-y-4">
        <Alert tone="warning" title="What needs to change">
          {item.remark}
        </Alert>
        {item.uploadedFileName && (
          <p className="flex items-center gap-2 text-sm font-medium text-success-700">
            <CheckCircle2 className="size-4" aria-hidden /> Uploaded: {item.uploadedFileName}
          </p>
        )}
        <FileDrop
          label={item.uploadedFileName ? 'Replace the upload' : 'Upload the corrected document'}
          hint="One PDF, or photos of each page"
          multiple
          disabled={busy}
          error={err}
          onFiles={(files) => void upload(files)}
        />
      </CardBody>
    </Card>
  );
}
