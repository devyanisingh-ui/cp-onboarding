import type { UseFormReturn } from 'react-hook-form';
import type { CpFormValues } from '@/lib/schemas';
import { CONSENT_STATEMENT } from '@/data/seed';
import { CP_TYPE_LABELS } from '@/lib/format';
import { Checkbox, Field, FormSection, Input, Textarea, Toggle } from '@/components/ui';

type Errors = Record<string, string | undefined>;

function flatten(errors: UseFormReturn<CpFormValues>['formState']['errors'], server: Record<string, string>): Errors {
  const out: Errors = { ...server };
  const walk = (obj: Record<string, unknown>, prefix = '') => {
    for (const [k, v] of Object.entries(obj ?? {})) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && 'message' in (v as object) && typeof (v as { message?: unknown }).message === 'string') out[path] = (v as { message: string }).message;
      else if (v && typeof v === 'object') walk(v as Record<string, unknown>, path);
    }
  };
  walk(errors as Record<string, unknown>);
  return out;
}

/**
 * CP master fields, type-specific (PRD §4). Built so each field could later be filled by the
 * CP through the portal (phase 3): plain labels, no internal jargon.
 */
export function CpFields({
  form,
  serverErrors = {},
  existing,
  accountMaskedHint,
}: {
  form: UseFormReturn<CpFormValues>;
  serverErrors?: Record<string, string>;
  existing?: boolean;
  accountMaskedHint?: string;
}) {
  const { register, watch, setValue, formState } = form;
  const e = flatten(formState.errors, serverErrors);
  const type = watch('type');
  const gst = watch('gstRegistered');

  return (
    <div className="space-y-8">
      <FormSection title={`${CP_TYPE_LABELS[type]} details`} description="Enter details exactly as they appear on the PAN and registration documents.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={type === 'individual' ? 'Full name (as on PAN)' : 'Legal name of the firm / company'} required error={e.legalName} className="sm:col-span-2">
            <Input {...register('legalName')} autoComplete="organization" />
          </Field>
          <Field label="PAN" required error={e.pan} hint={existing ? 'PAN cannot be changed — it identifies the CP.' : undefined}>
            <Input {...register('pan')} readOnly className="font-mono uppercase" />
          </Field>
          <Field label="Aadhaar — last 4 digits only" required error={e.aadhaarLast4} hint="Never enter the full Aadhaar number.">
            <Input {...register('aadhaarLast4')} inputMode="numeric" maxLength={4} autoComplete="off" />
          </Field>

          {type === 'sole_prop' && (
            <Field label="Name of the proprietor" required error={e['typeFields.proprietorName']} className="sm:col-span-2">
              <Input {...register('typeFields.proprietorName')} autoComplete="name" />
            </Field>
          )}
          {type === 'pvt_ltd' && (
            <>
              <Field label="CIN" required error={e['typeFields.cin']} hint="21 characters, e.g. U80900DL2018PTC334455">
                <Input {...register('typeFields.cin')} className="font-mono uppercase" maxLength={21} />
              </Field>
              <Field label="Board resolution date" required error={e['typeFields.boardResolutionDate']}>
                <Input type="date" {...register('typeFields.boardResolutionDate')} />
              </Field>
              <Field label="Director / authorised signatory" required error={e['typeFields.authorisedSignatory']} className="sm:col-span-2">
                <Input {...register('typeFields.authorisedSignatory')} placeholder="Name, designation" />
              </Field>
              <Field label="Registered office" required error={e['typeFields.registeredOffice']} className="sm:col-span-2">
                <Textarea rows={2} {...register('typeFields.registeredOffice')} />
              </Field>
            </>
          )}
          {type === 'partnership' && (
            <>
              <Field label="Partners" required error={e['typeFields.partners']} hint="Separate names with commas" className="sm:col-span-2">
                <Input {...register('typeFields.partners')} placeholder="Amit Sharma, Manpreet Gill" />
              </Field>
              <Field label="Partnership deed date" required error={e['typeFields.deedDate']}>
                <Input type="date" {...register('typeFields.deedDate')} />
              </Field>
              <Field label="Authorised partner" required error={e['typeFields.authorisedPartner']}>
                <Input {...register('typeFields.authorisedPartner')} />
              </Field>
            </>
          )}
          {type === 'individual' && (
            <>
              <Field label="Father’s name" required error={e['typeFields.fatherName']}>
                <Input {...register('typeFields.fatherName')} />
              </Field>
              <Field label="Date of birth" required error={e['typeFields.dob']}>
                <Input type="date" {...register('typeFields.dob')} />
              </Field>
            </>
          )}
        </div>
      </FormSection>

      <FormSection title="Contact and address">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact person" required error={e.contactPerson}>
            <Input {...register('contactPerson')} autoComplete="name" />
          </Field>
          <Field label="Mobile" required error={e.mobile} hint="10 digits, no +91">
            <Input {...register('mobile')} inputMode="numeric" maxLength={10} autoComplete="tel-national" prefix="+91" />
          </Field>
          <Field label="Email" required error={e.email} className="sm:col-span-2">
            <Input type="email" {...register('email')} autoComplete="email" />
          </Field>
          {type !== 'pvt_ltd' && (
            <Field label={type === 'sole_prop' ? 'Place of residence of the proprietor' : 'Residence address'} required error={e.residenceAddress} className="sm:col-span-2">
              <Textarea rows={2} {...register('residenceAddress')} autoComplete="street-address" />
            </Field>
          )}
          {type !== 'individual' && (
            <Field label="Place of business as per documents" required error={e.businessAddress} className="sm:col-span-2">
              <Textarea rows={2} {...register('businessAddress')} />
            </Field>
          )}
        </div>
      </FormSection>

      <FormSection title="Tax and bank details" description="Changing the name or bank details later requires re-verification by Audit.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Toggle checked={gst} onChange={(v) => setValue('gstRegistered', v, { shouldValidate: formState.isSubmitted })} label="GST registered" description="A GST certificate upload becomes mandatory." />
          </div>
          {gst && (
            <Field label="GSTIN" required error={e.gstin} hint="15 characters; characters 3–12 are the PAN" className="sm:col-span-2">
              <Input {...register('gstin')} className="font-mono uppercase" maxLength={15} />
            </Field>
          )}
          <Field label="Account holder name" required error={e['bank.holderName']}>
            <Input {...register('bank.holderName')} />
          </Field>
          <Field label="Account number" required={!existing} error={e['bank.accountNumber']} hint={existing ? `Current: ${accountMaskedHint}. Leave blank to keep it.` : '9–18 digits'}>
            <Input {...register('bank.accountNumber')} inputMode="numeric" autoComplete="off" className="font-mono" />
          </Field>
          <Field label="IFSC" required error={e['bank.ifsc']} hint="e.g. HDFC0001234">
            <Input {...register('bank.ifsc')} className="font-mono uppercase" maxLength={11} />
          </Field>
          <Field label="Bank name" required error={e['bank.bankName']}>
            <Input {...register('bank.bankName')} />
          </Field>
          <Field label="Branch" required error={e['bank.branch']} className="sm:col-span-2">
            <Input {...register('bank.branch')} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Consent (DPDP Act, 2023)">
        <div className="rounded-xl border border-white/80 bg-white/60 p-4">
          <p className="text-sm text-ink-soft">{CONSENT_STATEMENT}</p>
          <Checkbox className="mt-3" {...register('consentGiven')} invalid={!!e.consentGiven} label="The CP has read this statement and given consent" description="Consent and the purpose statement are recorded with your name and the time." />
          {e.consentGiven && (
            <p role="alert" className="mt-2 text-xs font-medium text-danger-700">
              {e.consentGiven}
            </p>
          )}
        </div>
      </FormSection>
    </div>
  );
}
