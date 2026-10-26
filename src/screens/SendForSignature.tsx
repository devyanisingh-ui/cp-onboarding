'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { KeyRound, Mail, PenLine, Send } from 'lucide-react';
import type { SignMethod, StampPaper } from '@/types';
import { api, type SignerInput } from '@/services/mockApi';
import { getDb } from '@/services/db';
import { useAction, useApi } from '@/hooks/useApi';
import { useDocumentTitle } from '@/hooks/misc';
import { today } from '@/lib/dates';
import { Alert, Button, Card, CardBody, CardHeader, ErrorState, Field, Input, PageSkeleton, RadioGroup, Select, Toggle } from '@/components/ui';
import { ActionBar, PageHeader } from '@/components/common';

const METHOD_OPTIONS: { value: SignMethod; label: string; description: string; icon: ReactElement }[] = [
  { value: 'electronic', label: 'Drawn or typed signature', description: 'Signs from a link in their email by drawing or typing their signature.', icon: <PenLine className="size-4" /> },
  { value: 'dsc', label: 'Digital signature certificate (DSC)', description: 'Signs with their DSC on a USB token and its PIN.', icon: <KeyRound className="size-4" /> },
];

export function SendForSignature() {
  const { id = '' } = useParams<{ id: string }>();
  const router = useRouter();
  useDocumentTitle(`Send for e-signature ${id}`);
  const { data, error, loading, reload } = useApi(() => api.agreements.get(id), [id]);
  const [cp, setCp] = useState<SignerInput | null>(null);
  const [inst, setInst] = useState<SignerInput | null>(null);
  const [everyPage, setEveryPage] = useState(true);
  const [stamp, setStamp] = useState<StampPaper>({ number: '', valueInr: 100, purchaseDate: today(), state: '', vendor: 'SHCIL (e-stamp)' });
  const send = useAction(() => api.agreements.sendForSignature(id, { signers: [cp!, inst!], signEveryPage: everyPage, stampPaper: stamp }), {
    success: 'Sent for e-signature',
    onSuccess: () => router.push(`/agreements/${id}`),
  });

  // Prefill once the agreement has loaded: the CP's signer by CP type, the institution's signatory.
  useEffect(() => {
    if (!data || cp) return;
    const a = data.agreement;
    const s = api.agreements.defaultCpSigner(a);
    const prev = a.esign; // re-sending after a decline or withdrawal keeps what was entered
    const prevOf = (role: 'cp' | 'institution') => prev?.signers.find((x) => x.role === role);
    setCp({ role: 'cp', name: prevOf('cp')?.name ?? s.name, designation: prevOf('cp')?.designation ?? s.designation, email: prevOf('cp')?.email ?? s.email, method: prevOf('cp')?.method ?? 'electronic' });
    setInst({ role: 'institution', name: prevOf('institution')?.name ?? a.signatoryName, designation: prevOf('institution')?.designation ?? a.signatoryDesignation, email: prevOf('institution')?.email ?? '', method: prevOf('institution')?.method ?? 'dsc' });
    if (prev) setEveryPage(prev.signEveryPage);
    setStamp((x) => ({ ...x, state: a.stampPaper?.state ?? data.institution.state, ...(a.stampPaper ?? {}) }));
  }, [data, cp]);

  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const d = data!;
  if (!d.actions.sendForSignature)
    return <ErrorState title="Can’t send for signature" error={new Error('Only agreements that are ready for signing, and not already out for signature, can be sent. Your role must be able to get agreements signed.')} />;
  if (!cp || !inst) return <PageSkeleton />;
  const fe = send.fieldErrors;
  const states = getDb().masterLists.stampStates;

  const signerCard = (s: SignerInput, set: (v: SignerInput) => void, order: number, title: string, description: string) => (
    <Card>
      <CardHeader title={`${order}. ${title}`} description={description} icon={<Mail />} />
      <CardBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Signer’s name" required error={fe[`${s.role}.name`]}>
            <Input value={s.name} onChange={(e) => set({ ...s, name: e.target.value })} />
          </Field>
          <Field label="Designation" optional>
            <Input value={s.designation ?? ''} onChange={(e) => set({ ...s, designation: e.target.value })} />
          </Field>
          <Field label="Email for the signing link" required error={fe[`${s.role}.email`]} className="sm:col-span-2">
            <Input type="email" autoComplete="off" value={s.email} onChange={(e) => set({ ...s, email: e.target.value })} placeholder="name@example.com" />
          </Field>
        </div>
        <RadioGroup<SignMethod> name={`${s.role}-method`} legend="Signing method" layout="cards" value={s.method} onChange={(m) => set({ ...s, method: m })} options={METHOD_OPTIONS} />
      </CardBody>
    </Card>
  );

  return (
    <div>
      <PageHeader title="Send for e-signature" subtitle={`${d.cp.legalName} · ${d.agreement.id} · ${d.institution.shortCode}`} />
      <div className="space-y-5">
        <Alert tone="info" title="How it works">
          The Channel Partner signs first. When they’re done, the institution’s signatory gets their link. Once both have signed, the signed PDF — with a
          signature certificate page — is filed as the signed copy and the agreement goes to Legal for review; Legal’s approval makes it Active.
        </Alert>
        {signerCard(cp, setCp, 1, 'Channel Partner', `Signs for ${d.cp.legalName}.`)}
        {signerCard(inst, setInst, 2, 'Institution', `Signs for ${d.institution.legalName}, after the Channel Partner.`)}
        <Card>
          <CardHeader title="Signature placement" />
          <CardBody>
            <Toggle
              checked={everyPage}
              onChange={setEveryPage}
              label="Sign every page"
              description="Besides the signature block, each signer’s signature is added to the foot of every page — like initialling each page of a paper agreement."
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="E-stamp certificate" description="Stamp duty still applies to an e-signed agreement. Buy the e-stamp (for example from SHCIL) before sending." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Certificate number" required error={fe['stamp.number']}>
              <Input value={stamp.number} onChange={(e) => setStamp({ ...stamp, number: e.target.value })} placeholder="IN-HR12345678901234X" />
            </Field>
            <Field label="Stamp duty (INR)" required error={fe['stamp.valueInr']}>
              <Input type="number" min={1} value={stamp.valueInr} onChange={(e) => setStamp({ ...stamp, valueInr: Number(e.target.value) })} />
            </Field>
            <Field label="Issue date" required error={fe['stamp.purchaseDate']}>
              <Input type="date" max={today()} value={stamp.purchaseDate} onChange={(e) => setStamp({ ...stamp, purchaseDate: e.target.value })} />
            </Field>
            <Field label="State" required error={fe['stamp.state']}>
              <Select value={stamp.state} onChange={(e) => setStamp({ ...stamp, state: e.target.value })}>
                <option value="">Choose…</option>
                {states.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Issued by" required error={fe['stamp.vendor']} className="sm:col-span-2">
              <Input value={stamp.vendor} onChange={(e) => setStamp({ ...stamp, vendor: e.target.value })} />
            </Field>
          </CardBody>
        </Card>
      </div>
      <ActionBar>
        <Button variant="secondary" onClick={() => router.push(`/agreements/${id}`)}>
          Cancel
        </Button>
        <Button icon={<Send className="size-4" />} loading={send.loading} onClick={() => void send.run()}>
          Send for signature
        </Button>
      </ActionBar>
    </div>
  );
}
