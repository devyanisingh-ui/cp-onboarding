'use client';

import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { api, type CpDTO } from '@/services/mockApi';
import { useAction } from '@/hooks/useApi';
import { cpFormSchema, type CpFormValues } from '@/lib/schemas';
import { Button, Modal } from '@/components/ui';
import { CpFields } from '@/components/CpFields';

/**
 * Edit a CP's master details. By default it saves as a plain CP edit; `save` replaces that, e.g.
 * when the BD corrects details Legal flagged on an agreement. `intro` shows above the form.
 */
export function EditCpModal<R = void>({
  cp,
  onClose,
  title = 'Edit CP details',
  intro,
  save: saveFn,
  success = 'CP details saved',
}: {
  cp: CpDTO;
  onClose: () => void;
  title?: string;
  intro?: ReactNode;
  save?: (v: CpFormValues) => Promise<R>;
  success?: string | ((r: R) => string);
}) {
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
  const save = useAction((v: CpFormValues) => (saveFn ? saveFn(v) : (api.cps.update(cp.id, v) as Promise<R>)), { success, onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={title}
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
      {intro}
      <form onSubmit={(e) => e.preventDefault()} noValidate>
        <CpFields form={form} existing serverErrors={save.fieldErrors} accountMaskedHint={cp.bank.accountMasked} />
      </form>
    </Modal>
  );
}
