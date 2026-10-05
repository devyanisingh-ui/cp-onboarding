import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, FileSearch, History, Save, Search, Send, Trash2, UserPlus } from 'lucide-react';
import type { CpType, DocumentType } from '@/types';
import { api, CP_STATUS_META, type AgreementDetail } from '@/services/mockApi';
import type { PanCheckResult } from '@/services/api/cps';
import type { WizardContext } from '@/services/api/agreements';
import { errorMessage } from '@/services/errors';
import { useSession } from '@/context/SessionContext';
import { useApi } from '@/hooks/useApi';
import { useDocumentTitle } from '@/hooks/misc';
import { agreementFormSchema, cpFormSchema, cpTypesForPan, panTypeHint, type AgreementFormValues, type CpFormValues } from '@/lib/schemas';
import { CP_TYPE_LABELS, CP_TYPES } from '@/lib/format';
import { formatDate, shiftDays, timeAgo, today } from '@/lib/dates';
import { isValidPan } from '@/lib/validation';
import { maskPan } from '@/lib/mask';
import { cn } from '@/lib/cn';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  DL,
  ErrorState,
  Field,
  Input,
  PageSkeleton,
  ProgressSteps,
  RadioGroup,
  Select,
  Spinner,
  Textarea,
  useToast,
} from '@/components/ui';
import { ActionBar, AgreementHtml, FileDrop, PageHeader, VerificationBadge, WarningBanner, docLabel } from '@/components/common';
import { CpFields } from '@/components/CpFields';

const STEPS = ['PAN check', 'Institution & type', 'CP details', 'Agreement details', 'KYC documents', 'Review & preview'];

const CP_TYPE_HELP: Record<CpType, string> = {
  sole_prop: 'One owner trading under a firm name',
  pvt_ltd: 'Company registered with the MCA (has a CIN)',
  partnership: 'Firm with two or more partners under a deed',
  individual: 'A person acting in their own name',
};

const emptyCp = (pan: string, type: CpType): CpFormValues => ({
  type,
  legalName: '',
  pan,
  contactPerson: '',
  mobile: '',
  email: '',
  residenceAddress: '',
  businessAddress: '',
  gstRegistered: false,
  gstin: '',
  bank: { holderName: '', accountNumber: '', ifsc: '', bankName: '', branch: '' },
  aadhaarLast4: '',
  typeFields: {},
  consentGiven: false,
});

interface WizardState {
  pan: string;
  panResult: PanCheckResult | null;
  institutionId: string;
  locationId: string;
  cpType: CpType | '';
  existingCpId?: string;
  overrideReason: string;
}

export function Wizard() {
  const { id: agreementIdParam } = useParams();
  const [params] = useSearchParams();
  const { data: ctxData, error: ctxError, reload } = useApi(() => api.agreements.wizardContext(), []);
  const existing = useApi(() => (agreementIdParam ? api.agreements.get(agreementIdParam) : Promise.resolve(null)), [agreementIdParam]);
  const resumeId = params.get('resume');
  const resume = useApi(() => (resumeId ? api.agreements.getWizardDraft(resumeId) : Promise.resolve(null)), [resumeId]);
  const cpParam = params.get('cp');
  const prefillCp = useApi(() => (cpParam ? api.cps.getForEdit(cpParam) : Promise.resolve(null)), [cpParam]);
  useDocumentTitle(agreementIdParam ? 'Edit draft' : 'New CP agreement');

  if (ctxError) return <ErrorState error={ctxError} onRetry={reload} />;
  if (existing.error) return <ErrorState error={existing.error} onRetry={existing.reload} />;
  if (!ctxData || existing.loading || resume.loading || prefillCp.loading) return <PageSkeleton />;
  if (existing.data && !existing.data.actions.edit)
    return (
      <ErrorState
        title="This agreement can’t be edited"
        error={new Error(existing.data.agreement.status === 'draft' ? 'You don’t have permission to edit this draft.' : 'Only drafts can be edited. Once submitted, changes go through rejection at Gate 1.')}
      />
    );
  return (
    <WizardInner
      key={`${agreementIdParam ?? 'new'}-${resumeId ?? ''}-${cpParam ?? ''}`}
      ctx={ctxData}
      detail={existing.data ?? null}
      resume={resume.data ?? null}
      prefill={prefillCp.data ?? null}
      initialStep={Number(params.get('step') ?? '') || undefined}
    />
  );
}

function WizardInner({
  ctx,
  detail,
  resume,
  prefill,
  initialStep,
}: {
  ctx: WizardContext;
  detail: AgreementDetail | null;
  resume: Awaited<ReturnType<typeof api.agreements.getWizardDraft>> | null;
  prefill: Awaited<ReturnType<typeof api.cps.getForEdit>> | null;
  initialStep?: number;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, institutionId: headerInst } = useSession();
  const editing = !!detail;
  const rd = resume?.data as (Partial<WizardState> & { cp?: CpFormValues }) | undefined;

  const [agreementId, setAgreementId] = useState<string | undefined>(detail?.agreement.id);
  const [wizardDraftId, setWizardDraftId] = useState<string | undefined>(resume?.id);
  const [step, setStep] = useState<number>(() => {
    if (editing) return Math.min(Math.max(initialStep ?? 2, 2), 5);
    return resume?.step ?? (prefill ? 1 : 0);
  });
  const [maxReached, setMaxReached] = useState(editing ? 5 : (resume?.step ?? (prefill ? 1 : 0)));
  const [busy, setBusy] = useState<'next' | 'save' | 'submit' | null>(null);
  const [state, setState] = useState<WizardState>(() => {
    if (detail)
      return { pan: '', panResult: null, institutionId: detail.agreement.institutionId, locationId: detail.agreement.locationId, cpType: detail.cp.type, existingCpId: detail.cp.id, overrideReason: '' };
    if (rd) return { pan: rd.pan ?? '', panResult: rd.panResult ?? null, institutionId: rd.institutionId ?? '', locationId: rd.locationId ?? '', cpType: rd.cpType ?? '', existingCpId: rd.existingCpId, overrideReason: rd.overrideReason ?? '' };
    if (prefill)
      return {
        pan: '',
        panResult: { exists: true, cp: { id: prefill.id, legalName: prefill.legalName, panMasked: prefill.panMasked, status: prefill.status, warning: prefill.warning, type: prefill.type, limited: false }, liveInstitutionIds: [], inProgressInstitutionIds: [] },
        institutionId: headerInst && ctx.institutions.some((i) => i.id === headerInst) ? headerInst : (ctx.institutions[0]?.id ?? ''),
        locationId: '',
        cpType: prefill.type,
        existingCpId: prefill.id,
        overrideReason: '',
      };
    return { pan: '', panResult: null, institutionId: headerInst && ctx.institutions.some((i) => i.id === headerInst) ? headerInst : ctx.institutions.length === 1 ? ctx.institutions[0]!.id : '', locationId: '', cpType: '', overrideReason: '' };
  });
  const patch = (p: Partial<WizardState>) => setState((s) => ({ ...s, ...p }));

  // When starting from a CP page, look up its live agreements via the PAN-free path.
  useEffect(() => {
    if (!prefill || editing || resume) return;
    api.cps
      .get(prefill.id)
      .then((v) => {
        if (v.limited) return;
        const live = v.agreements.filter((a) => a.status === 'active' || a.status === 'notice_period').map((a) => a.institutionId);
        const prog = v.agreements.filter((a) => ['draft', 'pending_approval', 'approved_for_signing', 'signed_copy_uploaded'].includes(a.status)).map((a) => a.institutionId);
        setState((s) => (s.panResult ? { ...s, panResult: { ...s.panResult, liveInstitutionIds: live, inProgressInstitutionIds: prog } } : s));
      })
      .catch(() => undefined);
  }, [prefill, editing, resume]);

  // ---------- CP form ----------
  const cpDefaults = useMemo<CpFormValues>(() => {
    const src = detail?.cp ?? prefill;
    if (rd?.cp) return rd.cp;
    if (src)
      return {
        type: src.type,
        legalName: src.legalName,
        pan: state.pan || src.panMasked,
        contactPerson: src.contactPerson,
        mobile: src.mobile,
        email: src.email,
        residenceAddress: src.residenceAddress,
        businessAddress: src.businessAddress,
        gstRegistered: src.gstRegistered,
        gstin: src.gstin ?? '',
        bank: { holderName: src.bank.holderName, accountNumber: '', ifsc: src.bank.ifsc, bankName: src.bank.bankName, branch: src.bank.branch },
        aadhaarLast4: src.aadhaarLast4,
        typeFields: { ...src.typeFields },
        consentGiven: !!src.consent,
      };
    return emptyCp(state.pan, (state.cpType || 'sole_prop') as CpType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const isExistingCp = !!state.existingCpId;
  const existingRef = useRef(isExistingCp);
  existingRef.current = isExistingCp;
  const cpForm = useForm<CpFormValues>({
    // Read at validation time: the PAN check can switch between new and existing CP.
    resolver: (values, c, o) => zodResolver(cpFormSchema({ requireAccount: !existingRef.current, existing: existingRef.current }))(values, c, o),
    defaultValues: cpDefaults,
    mode: 'onTouched',
  });
  const [cpServerErrors, setCpServerErrors] = useState<Record<string, string>>({});

  // ---------- Agreement form ----------
  const inst = ctx.institutions.find((i) => i.id === state.institutionId);
  const agForm = useForm<AgreementFormValues>({
    resolver: zodResolver(agreementFormSchema),
    mode: 'onTouched',
    defaultValues: {
      locationId: detail?.agreement.locationId ?? '',
      executionDate: detail?.agreement.executionDate ?? '',
      executionPlace: detail?.agreement.executionPlace ?? '',
      startDate: detail?.agreement.startDate ?? '',
      endDate: detail?.agreement.endDate ?? '',
      signatoryName: detail?.agreement.signatoryName ?? '',
      signatoryDesignation: detail?.agreement.signatoryDesignation ?? '',
      coordinatorName: detail?.agreement.coordinatorName ?? '',
    },
  });

  const label = () => cpForm.getValues('legalName') || (state.pan ? maskPan(state.pan) : 'Unnamed CP');

  const goto = (n: number) => {
    setStep(n);
    setMaxReached((m) => Math.max(m, n));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ---------- Save as draft (any step) ----------
  const saveDraft = async () => {
    setBusy('save');
    try {
      if (!agreementId) {
        const w = await api.agreements.saveWizardDraft({ id: wizardDraftId, step, data: { ...state, cp: cpForm.getValues() } as unknown as Record<string, unknown>, label: label() });
        setWizardDraftId(w.id);
        toast.success('Progress saved', 'Resume it any time from New CP agreement or Home.');
        navigate('/');
        return;
      }
      if (step === 2) await api.agreements.saveCpAndDraft({ agreementId, institutionId: state.institutionId, locationId: state.locationId, cp: cpForm.getValues() });
      if (step === 3) {
        const v = agForm.getValues();
        await api.agreements.saveFields(agreementId, Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '')));
      }
      toast.success('Draft saved');
      navigate(`/agreements/${agreementId}`);
    } catch (e) {
      toast.error('Could not save', errorMessage(e));
      const fe = (e as { fieldErrors?: Record<string, string> }).fieldErrors;
      if (fe) setCpServerErrors(fe);
    } finally {
      setBusy(null);
    }
  };

  // ---------- Next per step ----------
  const next = async () => {
    setBusy('next');
    try {
      if (step === 0) {
        if (!state.panResult) return toast.error('Check the PAN first');
        if (state.panResult.cp?.warning && state.overrideReason.trim().length < 5) return toast.error('Give a reason for the Admin override');
        goto(1);
      } else if (step === 1) {
        if (!state.institutionId || !state.locationId || !state.cpType) return toast.error('Choose the institution, location and CP type');
        if (cpForm.getValues('type') !== state.cpType) cpForm.setValue('type', state.cpType as CpType);
        if (!cpForm.getValues('pan')) cpForm.setValue('pan', state.pan);
        goto(2);
      } else if (step === 2) {
        const ok = await cpForm.trigger();
        if (!ok) {
          toast.error('Some details need attention', 'Check the highlighted fields.');
          return;
        }
        setCpServerErrors({});
        try {
          const res = await api.agreements.saveCpAndDraft({
            agreementId,
            existingCpId: state.existingCpId,
            institutionId: state.institutionId,
            locationId: state.locationId,
            cp: cpForm.getValues(),
            overrideReason: state.overrideReason,
            wizardDraftId,
          });
          if (!agreementId) {
            setAgreementId(res.agreementId);
            patch({ existingCpId: res.cpId });
            setWizardDraftId(undefined);
            navigate(`/agreements/${res.agreementId}/edit?step=3`, { replace: true });
            toast.success(`Draft ${res.agreementId} created`, 'Template and rate card loaded for this institution.');
            return;
          }
          goto(3);
        } catch (e) {
          const fe = (e as { fieldErrors?: Record<string, string> }).fieldErrors;
          if (fe) setCpServerErrors(fe);
          toast.error('Could not save CP details', errorMessage(e));
        }
      } else if (step === 3) {
        const ok = await agForm.trigger();
        if (!ok) return toast.error('Check the agreement details');
        await api.agreements.saveFields(agreementId!, agForm.getValues());
        goto(4);
      } else if (step === 4) {
        goto(5);
      }
    } catch (e) {
      toast.error('Something went wrong', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    setBusy('submit');
    try {
      await api.agreements.submit(agreementId!);
      toast.success('Submitted for Gate 1 approval', 'The approver has been notified.');
      navigate(`/agreements/${agreementId}`);
    } catch (e) {
      toast.error('Cannot submit yet', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const minStep = editing || agreementId ? 2 : 0;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Agreements', to: '/agreements' }, { label: agreementId ?? 'New CP agreement' }]}
        title={agreementId ? `Draft ${agreementId}` : 'New CP agreement'}
        subtitle={agreementId ? `${label()} · ${inst?.shortCode ?? ''}` : 'Six short steps. Save as a draft at any point and come back later.'}
      />
      {!agreementId && step === 0 && <ResumeList />}

      <Card className="mb-5 px-5 py-4">
        <ProgressSteps steps={STEPS} current={step} maxReached={maxReached} onStepClick={(i) => i >= minStep && goto(i)} />
      </Card>

      <Card>
        <CardBody className="p-5 sm:p-7">
          {step === 0 && <StepPan state={state} patch={patch} onFound={(r) => {
            if (r.exists && r.cp) {
              patch({ existingCpId: r.cp.id, cpType: r.cp.type ?? '' });
              api.cps.getForEdit(r.cp.id).then((c) => cpForm.reset({ ...cpForm.getValues(), type: c.type, legalName: c.legalName, pan: c.panMasked, contactPerson: c.contactPerson, mobile: c.mobile, email: c.email, residenceAddress: c.residenceAddress, businessAddress: c.businessAddress, gstRegistered: c.gstRegistered, gstin: c.gstin ?? '', bank: { holderName: c.bank.holderName, accountNumber: '', ifsc: c.bank.ifsc, bankName: c.bank.bankName, branch: c.bank.branch }, aadhaarLast4: c.aadhaarLast4, typeFields: { ...c.typeFields }, consentGiven: !!c.consent })).catch(() => undefined);
            } else {
              patch({ existingCpId: undefined });
              cpForm.reset(emptyCp(state.pan, (state.cpType || 'sole_prop') as CpType));
            }
          }} />}
          {step === 1 && <StepInstitution ctx={ctx} state={state} patch={patch} locked={editing} />}
          {step === 2 && (
            <>
              {isExistingCp && !editing && (
                <Alert tone="info" className="mb-6" title="Existing CP master">
                  These details come from the CP master. Update anything that has changed — edits apply to the CP everywhere.
                </Alert>
              )}
              <form onSubmit={(e) => (e.preventDefault(), void next())} noValidate>
                <CpFields form={cpForm} serverErrors={cpServerErrors} existing={isExistingCp} accountMaskedHint={(detail?.cp ?? prefill)?.bank.accountMasked} />
              </form>
            </>
          )}
          {step === 3 && inst && <StepAgreement form={agForm} inst={inst} />}
          {step === 4 && agreementId && <StepKyc agreementId={agreementId} />}
          {step === 5 && agreementId && <StepReview agreementId={agreementId} onEdit={goto} />}
        </CardBody>
      </Card>

      <ActionBar>
        {step > minStep && (
          <Button variant="secondary" icon={<ArrowLeft className="size-4" />} onClick={() => goto(step - 1)} className="md:mr-auto">
            Back
          </Button>
        )}
        <Button variant="ghost" icon={<Save className="size-4" />} loading={busy === 'save'} onClick={() => void saveDraft()} className="max-sm:hidden">
          Save as draft
        </Button>
        {step < 5 ? (
          <Button iconRight={<ArrowRight className="size-4" />} loading={busy === 'next'} onClick={() => void next()} disabled={step === 0 && !state.panResult}>
            {step === 2 && !agreementId ? 'Create draft' : 'Next'}
          </Button>
        ) : (
          <Button icon={<Send className="size-4" />} loading={busy === 'submit'} onClick={() => void submit()}>
            Submit for approval
          </Button>
        )}
      </ActionBar>
      <div className="mt-3 text-center sm:hidden">
        <button type="button" className="hit-area px-3 py-2 text-sm font-semibold text-primary-700" onClick={() => void saveDraft()}>
          Save as draft
        </button>
      </div>
      {user && <span className="sr-only" aria-live="polite">Step {step + 1} of {STEPS.length}: {STEPS[step]}</span>}
    </div>
  );
}

// ---------------- Resume list ----------------

function ResumeList() {
  const { data } = useApi(() => api.agreements.listWizardDrafts(), []);
  const toast = useToast();
  if (!data?.length) return null;
  return (
    <Card className="mb-5">
      <CardHeader title="Pick up where you left off" icon={<History />} />
      <ul className="divide-y divide-line">
        {data.map((w) => (
          <li key={w.id} className="flex items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{w.label}</p>
              <p className="text-xs text-muted">
                Stopped at step {w.step + 1} · {STEPS[w.step]} · saved {timeAgo(w.updatedAt)}
              </p>
            </div>
            <ButtonLink to={`/agreements/new?resume=${w.id}`} size="sm" variant="secondary">
              Resume
            </ButtonLink>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Discard ${w.label}`}
              icon={<Trash2 className="size-4" />}
              onClick={() => void api.agreements.discardWizardDraft(w.id).then(() => toast.info('Unfinished draft discarded'))}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------- Step 1 ----------------

function StepPan({ state, patch, onFound }: { state: WizardState; patch: (p: Partial<WizardState>) => void; onFound: (r: PanCheckResult) => void }) {
  const [pan, setPan] = useState(state.pan);
  const [error, setError] = useState<string>();
  const [checking, setChecking] = useState(false);
  const r = state.panResult;
  const check = async () => {
    const v = pan.trim().toUpperCase();
    if (!isValidPan(v)) return setError('PAN must be 5 letters, 4 digits and 1 letter, e.g. ABCDE1234F');
    setError(undefined);
    setChecking(true);
    try {
      const res = await api.cps.checkPan(v);
      patch({ pan: v, panResult: res, overrideReason: '' });
      onFound(res);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setChecking(false);
    }
  };
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Start with the CP’s PAN</h2>
        <p className="mt-1 text-sm text-muted">We check whether this partner already exists anywhere in Apeejay, so each CP is recorded only once.</p>
      </div>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-start"
        onSubmit={(e) => {
          e.preventDefault();
          void check();
        }}
      >
        <Field label="PAN" required error={error} className="sm:w-72" hint="Format AAAAA9999A">
          <Input
            value={pan}
            onChange={(e) => {
              setPan(e.target.value.toUpperCase());
              if (state.panResult) patch({ panResult: null });
            }}
            maxLength={10}
            autoComplete="off"
            className="font-mono text-base tracking-widest uppercase"
            placeholder="ABCDE1234F"
          />
        </Field>
        <Button type="submit" variant="secondary" icon={<Search className="size-4" />} loading={checking} className="sm:mt-[26px]">
          Check PAN
        </Button>
      </form>

      {r && !r.exists && (
        <Alert tone="success" title="No existing CP with this PAN">
          You’ll create a new CP master in step 3.
        </Alert>
      )}
      {r?.exists && r.cp && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/80 bg-white/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Existing CP found</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold">{r.cp.legalName}</p>
              <Badge tone={CP_STATUS_META[r.cp.status].tone}>{CP_STATUS_META[r.cp.status].label}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted">
              <span className="font-mono">{r.cp.panMasked}</span>
              {r.cp.type && ` · ${CP_TYPE_LABELS[r.cp.type]}`} · {r.cp.id}
            </p>
            {r.liveInstitutionIds.length > 0 && <p className="mt-2 text-sm text-ink-soft">Already has an active agreement with {r.liveInstitutionIds.length} institution(s) — those are unavailable in the next step.</p>}
            <p className="mt-3 flex items-center gap-2 text-sm font-medium text-primary-800">
              <UserPlus className="size-4" aria-hidden /> You’ll start a new agreement for this CP instead of creating a new one.
            </p>
          </div>
          {r.cp.warning && (
            <WarningBanner reason={r.cp.warning.reason}>
              <p className="mt-1">A new agreement needs an Admin override. Explain why this partner should be onboarded.</p>
            </WarningBanner>
          )}
          {r.cp.warning && (
            <Field label="Reason for Admin override" required hint="Sent to Admin with the draft. You can keep filling the draft while it’s reviewed; it can’t be submitted until approved.">
              <Textarea rows={3} value={state.overrideReason} onChange={(e) => patch({ overrideReason: e.target.value })} />
            </Field>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------- Step 2 ----------------

function StepInstitution({ ctx, state, patch, locked }: { ctx: WizardContext; state: WizardState; patch: (p: Partial<WizardState>) => void; locked: boolean }) {
  const inst = ctx.institutions.find((i) => i.id === state.institutionId);
  const blocked = new Set([...(state.panResult?.liveInstitutionIds ?? []), ...(state.panResult?.inProgressInstitutionIds ?? [])]);
  useEffect(() => {
    if (inst && !inst.locations.some((l) => l.id === state.locationId)) patch({ locationId: inst.locations.length === 1 ? inst.locations[0]!.id : '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.institutionId]);
  if (locked)
    return (
      <div className="space-y-4">
        <Alert tone="info">Institution and CP type are fixed once a draft exists. To change them, start a new agreement.</Alert>
        <DL items={[{ label: 'Institution', value: inst?.name }, { label: 'CP type', value: state.cpType && CP_TYPE_LABELS[state.cpType] }]} />
      </div>
    );
  if (!ctx.institutions.length) return <Alert tone="warning" title="No institutions assigned">Ask Admin to assign you to an institution before creating agreements.</Alert>;
  return (
    <div className="space-y-8">
      <RadioGroup
        name="institution"
        legend="Institution"
        required
        layout="cards"
        value={state.institutionId}
        onChange={(v) => patch({ institutionId: v })}
        options={ctx.institutions.map((i) => ({
          value: i.id,
          label: i.name,
          icon: <Building2 className="size-5" />,
          disabled: blocked.has(i.id) || !i.hasRateCard,
          description: blocked.has(i.id)
            ? state.panResult?.liveInstitutionIds.includes(i.id)
              ? 'CP already has an active agreement here — use Renew on it instead'
              : 'An agreement for this CP is already in progress here'
            : !i.hasRateCard
              ? 'No published rate card yet'
              : `${i.shortCode} · ${i.city}`,
        }))}
      />
      {inst && (
        <Field label="Location / campus" required className="max-w-md">
          <Select value={state.locationId} onChange={(e) => patch({ locationId: e.target.value })}>
            <option value="">Choose a location</option>
            {inst.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <RadioGroup
        name="cpType"
        legend="CP type"
        required
        layout="cards"
        value={state.cpType || undefined}
        onChange={(v) => patch({ cpType: v })}
        options={CP_TYPES.map((t) => {
          const fixed = !!state.existingCpId && state.cpType && state.cpType !== t;
          const noTpl = inst && !inst.hasTemplate[t];
          return {
            value: t,
            label: CP_TYPE_LABELS[t],
            disabled: !!fixed || !!noTpl,
            description: fixed ? 'Fixed by the existing CP master' : noTpl ? 'No published template for this institution' : `${CP_TYPE_HELP[t]}${state.pan && cpTypesForPan(state.pan).includes(t) ? ' · Matches this PAN' : ''}`,
          };
        })}
      />
      {state.cpType && state.pan && !state.existingCpId && panTypeHint(state.pan, state.cpType) && (
        <Alert tone="warning" title="Check the CP type">
          {panTypeHint(state.pan, state.cpType)}
        </Alert>
      )}
      {inst && state.cpType && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <CheckCircle2 className="size-4 text-success-600" aria-hidden /> The current published {CP_TYPE_LABELS[state.cpType]} template and {inst.shortCode} rate card will be used.
        </p>
      )}
    </div>
  );
}

// ---------------- Step 4 ----------------

function StepAgreement({ form, inst }: { form: UseFormReturn<AgreementFormValues>; inst: WizardContext['institutions'][number] }) {
  const { register, formState, setValue, getValues, watch } = form;
  const e = formState.errors;
  useEffect(() => {
    const v = getValues();
    if (!v.signatoryName) setValue('signatoryName', inst.signatoryName);
    if (!v.signatoryDesignation) setValue('signatoryDesignation', inst.signatoryDesignation);
    if (!v.coordinatorName) setValue('coordinatorName', inst.coordinatorName);
    if (!v.executionPlace) setValue('executionPlace', inst.city);
    if (!v.locationId) setValue('locationId', inst.locations[0]?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const start = watch('startDate');
  const setTerm = (years: number) => {
    const s = getValues('startDate');
    if (!s) return;
    setValue('endDate', shiftDays(shiftDays(s, years * 365), -1), { shouldValidate: true });
  };
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Agreement details</h2>
        <p className="mt-1 text-sm text-muted">Dates print as DD Month YYYY. Commencement can’t be before execution, and expiry must be after commencement.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Location / campus" required error={e.locationId?.message} className="sm:col-span-2">
          <Select {...register('locationId')} value={watch('locationId') ?? ''}>
            {inst.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Execution date" required error={e.executionDate?.message}>
          <Input type="date" min={today()} {...register('executionDate')} />
        </Field>
        <Field label="Place of execution" required error={e.executionPlace?.message}>
          <Input {...register('executionPlace')} />
        </Field>
        <Field label="Date of commencement" required error={e.startDate?.message}>
          <Input type="date" {...register('startDate')} />
        </Field>
        <Field
          label="Date of expiry"
          required
          error={e.endDate?.message}
          labelAction={
            start ? (
              <span className="flex gap-2 text-xs">
                <button type="button" className="hit-area font-semibold text-primary-700 hover:underline" onClick={() => setTerm(1)}>
                  1 year
                </button>
                <button type="button" className="hit-area font-semibold text-primary-700 hover:underline" onClick={() => setTerm(2)}>
                  2 years
                </button>
              </span>
            ) : undefined
          }
        >
          <Input type="date" {...register('endDate')} />
        </Field>
      </div>
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold">Institution signatory and coordinator</h3>
          <p className="mt-0.5 text-sm text-muted">Pre-filled from the {inst.shortCode} master. Edit only if a different person applies to this agreement.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Signing authority" required error={e.signatoryName?.message}>
            <Input {...register('signatoryName')} />
          </Field>
          <Field label="Designation of the signing authority" required error={e.signatoryDesignation?.message}>
            <Input {...register('signatoryDesignation')} />
          </Field>
          <Field label="Coordinator from the institution" required error={e.coordinatorName?.message} className="sm:col-span-2">
            <Input {...register('coordinatorName')} />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ---------------- Step 5 ----------------

const KYC: { type: DocumentType; label: string; hint: string }[] = [
  { type: 'pan', label: 'PAN copy', hint: 'PDF or photo, max 10 MB' },
  { type: 'aadhaar_masked', label: 'Masked Aadhaar', hint: 'The first 8 digits must be hidden' },
  { type: 'cancelled_cheque', label: 'Cancelled cheque', hint: 'Account holder name must be visible' },
  { type: 'gst_certificate', label: 'GST certificate', hint: 'Required because the CP is GST registered' },
];

function StepKyc({ agreementId }: { agreementId: string }) {
  const { data, loading, error, reload } = useApi(() => api.agreements.get(agreementId), [agreementId]);
  const [uploading, setUploading] = useState<DocumentType | null>(null);
  const [warnings, setWarnings] = useState<Partial<Record<DocumentType, string>>>({});
  const toast = useToast();
  if (loading && !data) return <Spinner label="Loading documents" />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const needed = KYC.filter((k) => k.type !== 'gst_certificate' || data.cp.gstRegistered);
  const upload = async (type: DocumentType, files: File[]) => {
    const f = files[0];
    if (!f) return;
    setUploading(type);
    try {
      const res = await api.documents.upload({ ownerType: 'cp', ownerId: data.cp.id, type, file: f, fileName: f.name });
      setWarnings((w) => ({ ...w, [type]: res.warnings[0] }));
      toast.success(`${docLabel(type)} uploaded`);
    } catch (e) {
      toast.error('Upload failed', errorMessage(e));
    } finally {
      setUploading(null);
    }
  };
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">KYC documents</h2>
        <p className="mt-1 text-sm text-muted">On a phone you can photograph documents directly. Files are stored encrypted and every view is logged.</p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {needed.map((k) => {
          const docs = data.cpDocuments.filter((d) => d.type === k.type);
          const latest = docs[0];
          return (
            <div key={k.type} className={cn('rounded-xl border p-4', latest ? 'border-green-200 bg-success-50/40' : 'border-line')}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  {k.label} <span className="text-danger-600" aria-hidden>*</span>
                </p>
                {latest ? <VerificationBadge status={latest.verificationStatus} /> : <Badge tone="grey">Missing</Badge>}
              </div>
              {latest && (
                <p className="mb-3 flex items-center gap-1.5 truncate text-xs text-muted">
                  <CheckCircle2 className="size-3.5 text-success-600" aria-hidden /> {latest.fileName} · {timeAgo(latest.uploadedAt)}
                </p>
              )}
              {uploading === k.type ? (
                <div className="flex h-28 items-center justify-center rounded-lg border-2 border-dashed border-primary-300 bg-primary-50">
                  <Spinner label="Uploading" />
                </div>
              ) : (
                <FileDrop label={latest ? 'Replace file' : 'Upload'} hint={k.hint} onFiles={(f) => void upload(k.type, f)} />
              )}
              {warnings[k.type] && (
                <Alert tone="warning" className="mt-3">
                  {warnings[k.type]}
                </Alert>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- Step 6 ----------------

function StepReview({ agreementId, onEdit }: { agreementId: string; onEdit: (step: number) => void }) {
  const detail = useApi(() => api.agreements.get(agreementId), [agreementId]);
  const doc = useApi(() => api.agreements.render(agreementId), [agreementId]);
  if ((detail.loading && !detail.data) || (doc.loading && !doc.data)) return <Spinner label="Generating preview" />;
  if (detail.error || doc.error) return <ErrorState error={detail.error ?? doc.error} onRetry={() => (detail.reload(), doc.reload())} />;
  const d = detail.data!;
  const r = doc.data!;
  const a = d.agreement;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Review and preview</h2>
          <p className="mt-1 text-sm text-muted">Check the merged agreement. Missing fields are highlighted and block submission.</p>
        </div>
        <ButtonLink to={`/agreements/${agreementId}/preview`} variant="secondary" icon={<FileSearch className="size-4" />}>
          Open full preview
        </ButtonLink>
      </div>
      {r.blockers.length ? (
        <Alert tone="warning" title="Before you can submit">
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {r.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Alert>
      ) : (
        <Alert tone="success" title="Ready to submit">
          All merge fields are filled and KYC is uploaded. Submitting sends it to the approver for Gate 1.
        </Alert>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <ReviewBlock title="CP details" onEdit={() => onEdit(2)} items={[['Name', d.cp.legalName], ['Type', CP_TYPE_LABELS[d.cp.type]], ['PAN', d.cp.panMasked], ['Mobile', d.cp.mobile]]} />
        <ReviewBlock
          title="Agreement"
          onEdit={() => onEdit(3)}
          items={[
            ['Execution', a.executionDate ? `${formatDate(a.executionDate)}, ${a.executionPlace ?? ''}` : '—'],
            ['Term', a.startDate && a.endDate ? `${formatDate(a.startDate)} – ${formatDate(a.endDate)}` : '—'],
            ['Signatory', `${a.signatoryName}, ${a.signatoryDesignation}`],
          ]}
        />
        <ReviewBlock title="KYC" onEdit={() => onEdit(4)} items={d.cpDocuments.length ? [...new Set(d.cpDocuments.map((x) => x.type))].map((t) => [docLabel(t), '✓ Uploaded'] as [string, string]) : [['Documents', 'None uploaded']]} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Need different rates or a clause change?</span>
        <Link to={`/agreements/${agreementId}/deviation`} className="font-semibold text-primary-700 hover:underline">
          Request a deviation
        </Link>
      </div>
      <div className="max-h-[520px] overflow-y-auto rounded-xl border border-line bg-white p-5 sm:p-8">
        <AgreementHtml html={r.html} />
      </div>
    </div>
  );
}

function ReviewBlock({ title, items, onEdit }: { title: string; items: [string, string][]; onEdit: () => void }) {
  return (
    <div className="rounded-xl border border-white/80 bg-white/60 p-4 shadow-xs">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button type="button" onClick={onEdit} className="text-xs font-semibold text-primary-700 hover:underline">
          Edit
        </button>
      </div>
      <dl className="space-y-1.5 text-sm">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="truncate text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
