import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Download, FileSpreadsheet, XCircle } from 'lucide-react';
import { api, type LegacyRow, type RowValidation } from '@/services/mockApi';
import { errorMessage } from '@/services/errors';
import { useApi } from '@/hooks/useApi';
import { useDocumentTitle } from '@/hooks/misc';
import { exportXlsx, readXlsxRows } from '@/lib/excel';
import { formatDateTime } from '@/lib/dates';
import { cn } from '@/lib/cn';
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, Table, TD, TH, useToast } from '@/components/ui';
import { FileDrop } from '@/components/common';

export function Legacy() {
  useDocumentTitle('Legacy import');
  const toast = useToast();
  const batches = useApi(() => api.legacy.batches(), []);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<LegacyRow[]>([]);
  const [preview, setPreview] = useState<RowValidation[] | null>(null);
  const [busy, setBusy] = useState(false);
  const cols = api.legacy.columns;

  const downloadTemplate = () =>
    void exportXlsx('CP_legacy_import_template.xlsx', 'Agreements', [Object.fromEntries(cols.map((c) => [c.key, c.example]))], cols.map((c) => ({ key: c.key, label: c.label }))).catch((e) => toast.error('Download failed', errorMessage(e)));

  const load = async (f: File) => {
    setBusy(true);
    try {
      const raw = await readXlsxRows(f);
      // Accept either the template's labels or raw keys as headers.
      const mapped = raw.map((r) => Object.fromEntries(cols.map((c) => [c.key, String(r[c.label] ?? r[c.key] ?? '').trim()])) as LegacyRow);
      setFile(f);
      setRows(mapped);
      setPreview(await api.legacy.preview(mapped));
    } catch (e) {
      toast.error('Could not read the file', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const b = await api.legacy.import(file.name, rows);
      toast.success(`${b.importedIds.length} agreement(s) imported`, b.errors.length ? `${b.errors.length} row(s) rejected — see details below.` : 'Owners now have tasks to upload each scan.');
      setFile(null);
      setRows([]);
      setPreview(null);
    } catch (e) {
      toast.error('Import failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const valid = preview?.filter((r) => !r.errors.length).length ?? 0;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Import active paper agreements" description="One row per active paper agreement. Each imported agreement enters at “Signed copy uploaded”, needs its scan, then goes through Gate 2 only." icon={<FileSpreadsheet />} />
        <CardBody className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
            <li>Download the Excel template and fill one row per agreement.</li>
            <li>Upload it — every row is checked for PAN format, dates, institution and duplicates.</li>
            <li>Import the valid rows. Owners then upload each scanned signed copy.</li>
          </ol>
          <Button variant="secondary" icon={<Download className="size-4" />} onClick={downloadTemplate}>
            Download Excel template
          </Button>
          <FileDrop label="Filled template" camera={false} accept=".xlsx,.xls,.csv" files={file ? [file] : []} onFiles={(f) => f[0] && void load(f[0])} onRemove={() => (setFile(null), setPreview(null))} disabled={busy} />
          <Alert tone="info">Expired paper agreements are not imported.</Alert>
        </CardBody>
      </Card>

      {preview && (
        <Card>
          <CardHeader title="Validation results" description={`${valid} of ${preview.length} rows are ready to import.`} />
          <Table caption="Validation results">
            <thead>
              <tr>
                <TH>Row</TH>
                <TH>CP</TH>
                <TH>Institution</TH>
                <TH>Result</TH>
              </tr>
            </thead>
            <tbody>
              {preview.map((r) => (
                <tr key={r.row} className={cn(r.errors.length && 'bg-danger-50/40')}>
                  <TD>{r.row}</TD>
                  <TD>
                    <p className="font-medium">{r.data.legal_name || '—'}</p>
                    <p className="font-mono text-xs text-muted">{r.data.pan}</p>
                  </TD>
                  <TD>{r.data.institution_code}</TD>
                  <TD>
                    {r.errors.length ? (
                      <ul className="space-y-0.5 text-xs text-danger-700">
                        {r.errors.map((e) => (
                          <li key={e} className="flex gap-1">
                            <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                            {e}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-success-700">
                        <CheckCircle2 className="size-3.5" aria-hidden /> Ready
                      </span>
                    )}
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="flex justify-end border-t border-line p-4">
            <Button disabled={!valid} loading={busy} onClick={() => void doImport()}>
              Import {valid} row{valid === 1 ? '' : 's'}
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Import history" action={<Link to="/reports/legacy" className="text-sm font-semibold text-primary-700 hover:underline">Legacy import status report</Link>} />
        {batches.data?.length ? (
          <ul className="divide-y divide-line">
            {batches.data.map((b) => (
              <li key={b.id} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{b.fileName}</span>
                  <Badge tone="green">{b.importedIds.length} imported</Badge>
                  {b.errors.length > 0 && <Badge tone="red">{b.errors.length} rejected</Badge>}
                  <span className="text-xs text-muted">
                    {b.id} · {formatDateTime(b.uploadedAt)}
                  </span>
                </div>
                {b.errors.map((e) => (
                  <p key={e.row} className="mt-1 text-xs text-danger-700">
                    Row {e.row}: {e.messages.join('; ')}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact title="No imports yet" />
        )}
      </Card>
    </div>
  );
}
