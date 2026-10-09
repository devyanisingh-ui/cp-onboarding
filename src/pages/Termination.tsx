import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Ban, ThumbsDown, ThumbsUp } from 'lucide-react';
import { api } from '@/services/mockApi';
import { getDb } from '@/services/db';
import { errorMessage } from '@/services/errors';
import { useAction, useApi } from '@/hooks/useApi';
import { useDocumentTitle } from '@/hooks/misc';
import { formatDate, shiftDays, today } from '@/lib/dates';
import { useSession } from '@/context/SessionContext';
import { can } from '@/lib/permissions';
import { Alert, Button, Card, CardBody, CardHeader, DL, ErrorState, Field, Input, PageSkeleton, RadioGroup, Select, useToast } from '@/components/ui';
import { ActionBar, CommentDialog, FileDrop, PageHeader } from '@/components/common';

export function Termination() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useSession();
  const { data, error, loading, reload } = useApi(() => api.agreements.get(id), [id]);
  const [type, setType] = useState<'convenience' | 'breach'>('convenience');
  const [reason, setReason] = useState('');
  const [noticeDate, setNoticeDate] = useState(today());
  const [effective, setEffective] = useState(shiftDays(today(), 30));
  const [effectiveTouched, setEffectiveTouched] = useState(false);
  const [file, setFile] = useState<File[]>([]);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  useDocumentTitle(`Terminate ${id}`);
  const confirm = useAction((dec: 'confirm' | 'reject', c?: string) => api.agreements.confirmTermination(id, dec, c), { success: 'Decision recorded', onSuccess: () => navigate(`/agreements/${id}`) });

  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const d = data!;
  const a = d.agreement;
  const reasons = getDb().masterLists.terminationReasons;
  const canConfirm = !!user && can(user, 'termination.confirm');

  const start = async () => {
    const e: Record<string, string> = {};
    if (!reason) e.reason = 'Choose a reason';
    if (!noticeDate) e.noticeDate = 'Enter the notice date';
    if (!effective || effective < noticeDate) e.effective = 'Must be on or after the notice date';
    if (!file.length) e.file = 'Uploading the termination notice letter is mandatory';
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await api.agreements.startTermination(id, { type, reason, noticeDate, effectiveDate: effective, noticeFile: file[0]!, noticeFileName: file[0]!.name });
      toast.success(canConfirm ? 'Termination confirmed' : 'Sent to Admin to confirm');
      navigate(`/agreements/${id}`);
    } catch (err) {
      toast.error('Could not start termination', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader breadcrumbs={[{ label: 'Agreements', to: '/agreements' }, { label: a.id, to: `/agreements/${a.id}` }, { label: 'Termination' }]} title="Terminate agreement" subtitle={`${d.cp.legalName} · ${d.institution.shortCode} · expires ${formatDate(a.endDate)}`} />

      {d.actions.confirmTermination && a.termination ? (
        <Card>
          <CardHeader title="Confirm termination" description={`Started by ${d.names[a.termination.startedById]}`} />
          <CardBody className="space-y-4">
            <DL
              items={[
                { label: 'Type', value: a.termination.type === 'breach' ? 'Breach' : 'Convenience' },
                { label: 'Reason', value: a.termination.reason },
                { label: 'Notice date', value: formatDate(a.termination.noticeDate) },
                { label: 'Effective date', value: formatDate(a.termination.effectiveDate) },
              ]}
            />
            {a.termination.type === 'breach' && <Alert tone="warning">Confirming sets a warning flag on this CP, visible to every institution. New agreements will need an Admin override.</Alert>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" icon={<ThumbsDown className="size-4" />} onClick={() => setRejecting(true)}>
                Don’t confirm
              </Button>
              <Button variant="danger" icon={<ThumbsUp className="size-4" />} loading={confirm.loading} onClick={() => void confirm.run('confirm')}>
                Confirm termination
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : d.actions.terminate ? (
        <>
          <Card>
            <CardBody className="space-y-5">
              <RadioGroup
                name="type"
                legend="Termination type"
                required
                layout="cards"
                value={type}
                onChange={setType}
                options={[
                  { value: 'convenience', label: 'Convenience', description: '30 days’ written notice under clause 5.' },
                  { value: 'breach', label: 'Breach', description: 'Sets a warning flag on the CP for all institutions.' },
                ]}
              />
              <Field label="Reason" required error={errs.reason}>
                <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="">Choose a reason</option>
                  {reasons.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </Select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Notice date" required error={errs.noticeDate}>
                  <Input
                    type="date"
                    value={noticeDate}
                    onChange={(e) => {
                      setNoticeDate(e.target.value);
                      if (!effectiveTouched && e.target.value) setEffective(shiftDays(e.target.value, 30));
                    }}
                  />
                </Field>
                <Field label="Effective date" required error={errs.effective} hint="Defaults to notice date + 30 days">
                  <Input type="date" value={effective} min={noticeDate} onChange={(e) => (setEffective(e.target.value), setEffectiveTouched(true))} />
                </Field>
              </div>
              <FileDrop label="Termination notice letter" required files={file} error={errs.file} onFiles={(f) => setFile(f.slice(0, 1))} onRemove={() => setFile([])} />
              {type === 'breach' && <Alert tone="warning">A breach termination flags this CP everywhere. Make sure the notice letter states the breach.</Alert>}
              <p className="text-sm text-muted">{canConfirm ? 'As Admin, submitting confirms the termination immediately.' : 'Admin confirms before it takes effect. The agreement then moves to Notice period and becomes Terminated on the effective date.'}</p>
            </CardBody>
          </Card>
          <ActionBar>
            <Button variant="danger" icon={<Ban className="size-4" />} loading={busy} onClick={() => void start()}>
              {canConfirm ? 'Terminate' : 'Send for confirmation'}
            </Button>
          </ActionBar>
        </>
      ) : (
        <Alert tone="info">{a.termination?.confirmation === 'pending' ? 'This termination is waiting for Admin confirmation.' : 'Only active agreements can be terminated, by a BD Executive or Admin.'}</Alert>
      )}
      <CommentDialog open={rejecting} onClose={() => setRejecting(false)} title="Don’t confirm termination" confirmLabel="Send back" onConfirm={async (c) => (await confirm.run('reject', c)).ok} />
    </div>
  );
}
