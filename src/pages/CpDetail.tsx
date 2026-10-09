import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, FileText, Lock, Pencil, Plus, ShieldCheck } from 'lucide-react';
import type { DocumentRecord } from '@/types';
import { api, CP_STATUS_META, type CpDTO } from '@/services/mockApi';
import { useSession } from '@/context/SessionContext';
import { useAction, useApi } from '@/hooks/useApi';
import { useDocumentTitle } from '@/hooks/misc';
import { CP_TYPE_LABELS } from '@/lib/format';
import { formatDate, formatDateTime } from '@/lib/dates';
import { maskAadhaar } from '@/lib/mask';
import { cpFormSchema, type CpFormValues } from '@/lib/schemas';
import { typeFieldDefs } from '@/lib/agreementTemplate';
import { STATUS_META } from '@/lib/status';
import { Alert, Badge, Button, ButtonLink, Card, CardBody, CardHeader, DL, EmptyState, ErrorState, Field, Modal, PageSkeleton, RadioGroup, StatusBadge, Tabs, Textarea } from '@/components/ui';
import { DocumentList, MaskedValue, PageHeader, Timeline, WarningBanner, docLabel } from '@/components/common';
import { AgreementTable } from '@/components/lists';
import { CpFields } from '@/components/CpFields';

type Tab = 'details' | 'kyc' | 'agreements' | 'history';

export function CpDetail() {
  const { id = '' } = useParams();
  const { can } = useSession();
  const { data, error, loading, reload } = useApi(() => api.cps.get(id), [id]);
  const [tab, setTab] = useState<Tab>('details');
  const [editing, setEditing] = useState(false);
  const [verifying, setVerifying] = useState<DocumentRecord | null>(null);
  useDocumentTitle(data?.cp.legalName ?? 'Channel Partner');

  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const crumbs = [{ label: 'CPs', to: '/cps' }, { label: data.cp.legalName }];

  if (data.limited) {
    return (
      <div>
        <PageHeader breadcrumbs={crumbs} title={data.cp.legalName} badges={<Badge tone={CP_STATUS_META[data.cp.status].tone}>{CP_STATUS_META[data.cp.status].label}</Badge>} subtitle={<span className="font-mono">{data.cp.panMasked}</span>} />
        <div className="space-y-4">
          {data.cp.warning && <WarningBanner reason={data.cp.warning.reason} />}
          <Alert tone="info" title="Limited view">
            This CP’s agreements are with institutions outside your scope, so you can only see its name, masked PAN, status and any warning flag.
          </Alert>
          <Card>
            <CardHeader title="Agreements elsewhere" />
            <ul className="divide-y divide-line">
              {data.institutions.map((i, idx) => (
                <li key={idx} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <Lock className="size-4 text-subtle" aria-hidden /> {i.code}
                  </span>
                  <StatusBadge status={i.status as keyof typeof STATUS_META} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    );
  }

  const { cp, documents, agreements, history, names } = data;
  const visible = agreements.filter((a) => !a.outOfScope);
  const hidden = agreements.filter((a) => a.outOfScope);

  return (
    <div>
      <PageHeader
        breadcrumbs={crumbs}
        title={cp.legalName}
        badges={
          <>
            <Badge tone={CP_STATUS_META[cp.status].tone}>{CP_STATUS_META[cp.status].label}</Badge>
            {cp.warning && <Badge tone="red" icon={<AlertTriangle className="size-3" aria-hidden />}>Warning flag</Badge>}
          </>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{CP_TYPE_LABELS[cp.type]}</span>
            <span aria-hidden>·</span>
            <span>{cp.id}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              PAN <MaskedValue masked={cp.panMasked} label="PAN" reveal={() => api.cps.reveal(cp.id, 'pan')} />
            </span>
          </span>
        }
        actions={
          <>
            {data.canEdit && (
              <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                Edit details
              </Button>
            )}
            {can('agreement.create') && (
              <ButtonLink to={`/agreements/new?cp=${cp.id}`} icon={<Plus className="size-4" />}>
                New agreement
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="mb-5 space-y-3">
        {cp.warning && (
          <WarningBanner reason={cp.warning.reason}>
            <p className="mt-1 text-xs">Set {formatDateTime(cp.warning.setAt)} by {names[cp.warning.setById] ?? 'Admin'}. New agreements need an Admin override with a reason.</p>
          </WarningBanner>
        )}
        {cp.reverificationRequired && (
          <Alert tone="warning" title="Re-verification required">
            The CP’s name or bank details changed. Admin must re-verify the PAN copy and cancelled cheque.
          </Alert>
        )}
      </div>

      <div className="mb-5">
        <Tabs
          label="CP sections"
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'details', label: 'Details' },
            { id: 'kyc', label: 'KYC documents', count: documents.length },
            { id: 'agreements', label: 'Agreements', count: agreements.length },
            { id: 'history', label: 'History' },
          ]}
        />
      </div>

      {tab === 'details' && <CpDetails cp={cp} names={names} />}
      {tab === 'kyc' && (
        <Card>
          <CardHeader title="KYC documents" description="Manual verification by Admin: verified by, on, method and remarks are recorded." icon={<ShieldCheck />} />
          <DocumentList docs={documents} names={names} onVerify={can('gate2.verify') ? setVerifying : undefined} empty="No KYC documents yet. They’re uploaded in step 5 of the new agreement wizard." />
        </Card>
      )}
      {tab === 'agreements' && (
        <Card>
          <CardHeader title="Agreements" description="Across all institutions — those outside your scope show status only." icon={<FileText />} />
          {visible.length ? <AgreementTable items={visible} caption="Agreements for this CP" /> : <EmptyState compact title="No agreements in your scope" />}
          {hidden.length > 0 && (
            <div className="border-t border-line px-5 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Outside your scope</p>
              <ul className="space-y-2">
                {hidden.map((a) => (
                  <li key={a.id} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-ink-soft">
                      <Lock className="size-3.5 text-subtle" aria-hidden /> {a.institutionCode}
                    </span>
                    <StatusBadge status={a.displayStatus} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
      {tab === 'history' && (
        <Card>
          <CardHeader title="History" description="Every change to this CP and its agreements in your scope." />
          <Timeline events={history} limit={15} />
        </Card>
      )}

      {editing && <EditCpModal cp={cp} onClose={() => setEditing(false)} />}
      <VerifyDocModal doc={verifying} onClose={() => setVerifying(null)} />
    </div>
  );
}

function CpDetails({ cp, names }: { cp: CpDTO; names: Record<string, string> }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Partner" />
        <CardBody>
          <DL
            items={[
              { label: 'Legal name', value: cp.legalName, full: true },
              { label: 'CP type', value: CP_TYPE_LABELS[cp.type] },
              { label: 'Aadhaar', value: <span className="font-mono">{maskAadhaar(cp.aadhaarLast4)}</span> },
              ...typeFieldDefs(cp.type).map((f) => ({ label: f.label, value: f.date ? formatDate(cp.typeFields[f.key]) : cp.typeFields[f.key] })),
            ]}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Contact" />
        <CardBody>
          <DL
            items={[
              { label: 'Contact person', value: cp.contactPerson },
              { label: 'Mobile', value: cp.mobile && `+91 ${cp.mobile}` },
              { label: 'Email', value: cp.email, full: true },
              ...(cp.type !== 'pvt_ltd' ? [{ label: 'Residence address', value: cp.residenceAddress, full: true }] : []),
              ...(cp.type !== 'individual' ? [{ label: 'Business address', value: cp.businessAddress, full: true }] : []),
            ]}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Tax and bank" />
        <CardBody>
          <DL
            items={[
              { label: 'GST registered', value: cp.gstRegistered ? 'Yes' : 'No' },
              { label: 'GSTIN', value: cp.gstin ? <MaskedValue masked={cp.gstin} label="GSTIN" reveal={() => api.cps.reveal(cp.id, 'gstin')} /> : '—' },
              { label: 'Account holder', value: cp.bank.holderName },
              { label: 'Account number', value: <MaskedValue masked={cp.bank.accountMasked} label="account number" reveal={() => api.cps.reveal(cp.id, 'account')} /> },
              { label: 'IFSC', value: <span className="font-mono">{cp.bank.ifsc}</span> },
              { label: 'Bank and branch', value: `${cp.bank.bankName}${cp.bank.branch ? `, ${cp.bank.branch}` : ''}` },
            ]}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Consent and record" />
        <CardBody>
          <DL
            cols={1}
            items={[
              { label: 'DPDP consent', value: cp.consent ? `Recorded ${formatDateTime(cp.consent.recordedAt)} by ${names[cp.consent.recordedById] ?? '—'}` : <span className="text-danger-700">Not recorded</span> },
              { label: 'Created', value: `${formatDateTime(cp.createdAt)} by ${names[cp.createdById] ?? '—'}` },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}

function EditCpModal({ cp, onClose }: { cp: CpDTO; onClose: () => void }) {
  const form = useForm<CpFormValues>({
    resolver: zodResolver(cpFormSchema({ requireAccount: false, existing: true })),
    defaultValues: {
      type: cp.type,
      legalName: cp.legalName,
      pan: cp.panMasked,
      contactPerson: cp.contactPerson,
      mobile: cp.mobile,
      email: cp.email,
      residenceAddress: cp.residenceAddress,
      businessAddress: cp.businessAddress,
      gstRegistered: cp.gstRegistered,
      gstin: cp.gstin ?? '',
      bank: { holderName: cp.bank.holderName, accountNumber: '', ifsc: cp.bank.ifsc, bankName: cp.bank.bankName, branch: cp.bank.branch },
      aadhaarLast4: cp.aadhaarLast4,
      typeFields: { ...cp.typeFields },
      consentGiven: !!cp.consent,
    },
  });
  const save = useAction((v: CpFormValues) => api.cps.update(cp.id, v), { success: 'CP details saved', onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Edit CP details"
      description="Name or bank changes send the CP’s KYC back to Admin for re-verification."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.loading} onClick={form.handleSubmit((v) => void save.run(v))}>
            Save changes
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => e.preventDefault()} noValidate>
        <CpFields form={form} existing serverErrors={save.fieldErrors} accountMaskedHint={cp.bank.accountMasked} />
      </form>
    </Modal>
  );
}

function VerifyDocModal({ doc, onClose }: { doc: DocumentRecord | null; onClose: () => void }) {
  const [status, setStatus] = useState<'verified' | 'mismatch'>('verified');
  const [remarks, setRemarks] = useState('');
  const act = useAction(() => api.documents.verify(doc!.id, status, remarks), { success: 'Verification recorded', onSuccess: () => (setRemarks(''), onClose()) });
  return (
    <Modal
      open={!!doc}
      onClose={onClose}
      title={`Verify ${doc ? docLabel(doc.type) : ''}`}
      description="Manual check. Your name, the time and the method are recorded."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={act.loading} onClick={() => void act.run()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <RadioGroup
          name="verify"
          legend="Result"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'verified', label: 'Verified', description: 'The document matches the entered data.' },
            { value: 'mismatch', label: 'Mismatch', description: 'Something doesn’t match — explain in remarks.' },
          ]}
        />
        <Field label="Remarks" required={status === 'mismatch'} optional={status === 'verified'} error={act.error ?? undefined}>
          <Textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
