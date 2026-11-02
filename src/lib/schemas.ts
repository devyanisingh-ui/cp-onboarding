import { z } from 'zod';
import type { CpType } from '@/types';
import { CP_TYPE_LABELS } from './format';
import { HAS_OWNER_PAN, PERSON_ROLE } from './kyc';
import { AADHAAR4_RE, CIN_RE, GSTIN_RE, IFSC_RE, MOBILE_RE, PAN_RE, agreementDateErrors } from './validation';

/**
 * PAN 4th character encodes the holder type (P = person, C = company, F = firm).
 * Advisory only: shown as guidance when choosing the CP type, never a blocking error,
 * because the PRD only mandates the AAAAA9999A format.
 */
const PAN_HOLDER: Record<CpType, { chars: string[]; label: string }> = {
  individual: { chars: ['P'], label: 'an individual' },
  sole_prop: { chars: ['P'], label: 'an individual (the proprietor)' },
  // A proprietorship's PAN is often the proprietor's own; accept either.
  proprietorship: { chars: ['P', 'F'], label: 'the proprietor or the firm' },
  partnership: { chars: ['F'], label: 'a firm' },
  pvt_ltd: { chars: ['C'], label: 'a company' },
};

const HOLDER_BY_CHAR: Record<string, string> = { P: 'an individual', C: 'a company', F: 'a firm' };

/** Returns a guidance message when the PAN's holder type doesn't match the CP type, else null. */
export function panTypeHint(pan: string, type: CpType): string | null {
  const p = pan.trim().toUpperCase();
  if (!PAN_RE.test(p) || PAN_HOLDER[type].chars.includes(p[3]!)) return null;
  const actual = HOLDER_BY_CHAR[p[3]!] ?? `holder type “${p[3]}”`;
  return `This PAN belongs to ${actual} (4th character ${p[3]}), but a ${CP_TYPE_LABELS[type]} CP usually has a PAN of ${PAN_HOLDER[type].label} (4th character ${PAN_HOLDER[type].chars.join(' or ')}). Check the PAN or the CP type.`;
}

/** CP types whose usual PAN holder type matches this PAN. */
export function cpTypesForPan(pan: string): CpType[] {
  const c = pan.trim().toUpperCase()[3];
  return (Object.keys(PAN_HOLDER) as CpType[]).filter((t) => !!c && PAN_HOLDER[t].chars.includes(c));
}

const optionalText = z.string().trim().optional().or(z.literal(''));

export const cpFormSchema = (opts: { requireAccount: boolean; existing?: boolean }) =>
  z
    .object({
      type: z.enum(['individual', 'sole_prop', 'proprietorship', 'partnership', 'pvt_ltd']),
      legalName: z.string().trim().min(2, 'Enter the legal name as on PAN'),
      // Existing CPs send the masked PAN back; the server keeps the stored value.
      pan: opts.existing ? z.string() : z.string().trim().toUpperCase().regex(PAN_RE, 'PAN must look like AAAAA9999A'),
      contactPerson: z.string().trim().min(2, 'Enter a contact person'),
      mobile: z.string().trim().regex(MOBILE_RE, 'Enter a 10-digit mobile number starting 6–9'),
      email: z.string().trim().email('Enter a valid email address'),
      residenceAddress: z.string().trim(),
      businessAddress: z.string().trim(),
      gstRegistered: z.boolean(),
      gstin: optionalText,
      bank: z.object({
        holderName: z.string().trim().min(2, 'Enter the account holder name'),
        accountNumber: z.string().trim(),
        ifsc: z.string().trim().toUpperCase().regex(IFSC_RE, 'IFSC must be 11 characters, e.g. HDFC0001234'),
        bankName: z.string().trim().min(2, 'Enter the bank name'),
        branch: z.string().trim().min(2, 'Enter the branch'),
      }),
      aadhaarLast4: z.string().trim().regex(AADHAAR4_RE, 'Enter only the last 4 digits'),
      typeFields: z.object({
        proprietorName: optionalText,
        cin: optionalText,
        registeredOffice: optionalText,
        authorisedSignatory: optionalText,
        boardResolutionDate: optionalText,
        partners: optionalText,
        deedDate: optionalText,
        authorisedPartner: optionalText,
        fatherName: optionalText,
        dob: optionalText,
        ownerName: optionalText,
        // Existing CPs send the masked owner PAN back; the server keeps the stored value.
        ownerPan: optionalText,
        msmeNumber: optionalText,
        shopLicenceNumber: optionalText,
        businessRegistration: optionalText,
        incorporationDate: optionalText,
      }),
      consentGiven: z.boolean(),
    })
    .superRefine((v, ctx) => {
      const req = (path: (string | number)[], ok: boolean, message: string) => {
        if (!ok) ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
      };
      req(['consentGiven'], v.consentGiven, 'Record the CP’s consent before saving personal data');
      if (opts.requireAccount || v.bank.accountNumber)
        req(['bank', 'accountNumber'], /^\d{9,18}$/.test(v.bank.accountNumber), 'Account number must be 9–18 digits');
      // Individuals are not GST registered on the checklist.
      // A masked GSTIN (••••) means "unchanged" for an existing CP; the server keeps the stored one.
      if (v.gstRegistered && v.type !== 'individual' && !(opts.existing && (v.gstin ?? '').includes('•'))) {
        const g = (v.gstin ?? '').toUpperCase();
        req(['gstin'], GSTIN_RE.test(g), 'GSTIN must be 15 characters starting with a 2-digit state code');
        if (GSTIN_RE.test(g) && PAN_RE.test(v.pan)) req(['gstin'], g.slice(2, 12) === v.pan, 'GSTIN characters 3–12 must match the PAN');
      }
      if (v.type !== 'pvt_ltd') req(['residenceAddress'], v.residenceAddress.length >= 5, 'Enter the residence address');
      if (v.type !== 'individual') req(['businessAddress'], v.businessAddress.length >= 5, 'Enter the business address as per documents');
      const t = v.typeFields;
      if (HAS_OWNER_PAN[v.type]) {
        const op = (t.ownerPan ?? '').toUpperCase();
        // A masked value (••••) means "unchanged" for an existing CP.
        if (!(opts.existing && op.includes('•'))) req(['typeFields', 'ownerPan'], PAN_RE.test(op), `Enter the ${PERSON_ROLE[v.type]}’s PAN, e.g. ABCPK1234L`);
      }
      const msme = () => req(['typeFields', 'msmeNumber'], (t.msmeNumber ?? '').length >= 8, 'Enter the Udyam / MSME registration number, e.g. UDYAM-HR-05-0012345');
      switch (v.type) {
        case 'sole_prop':
          req(['typeFields', 'proprietorName'], !!t.proprietorName && t.proprietorName.length >= 2, 'Enter the proprietor’s name');
          msme();
          break;
        case 'proprietorship':
          req(['typeFields', 'ownerName'], !!t.ownerName && t.ownerName.length >= 2, 'Enter the firm owner’s name');
          msme();
          req(['typeFields', 'businessRegistration'], (t.businessRegistration ?? '').length >= 3, 'Enter the business registration (type and number)');
          break;
        case 'pvt_ltd':
          req(['typeFields', 'cin'], CIN_RE.test((t.cin ?? '').toUpperCase()), 'CIN must be 21 characters, e.g. U80900DL2018PTC334455');
          req(['typeFields', 'incorporationDate'], !!t.incorporationDate, 'Enter the date of incorporation');
          req(['typeFields', 'registeredOffice'], !!t.registeredOffice && t.registeredOffice.length >= 5, 'Enter the registered office');
          req(['typeFields', 'authorisedSignatory'], !!t.authorisedSignatory, 'Enter the director or authorised signatory');
          req(['typeFields', 'boardResolutionDate'], !!t.boardResolutionDate, 'Enter the board resolution date');
          break;
        case 'partnership':
          req(['typeFields', 'partners'], !!t.partners && t.partners.includes(','), 'List at least two partners, separated by commas');
          req(['typeFields', 'deedDate'], !!t.deedDate, 'Enter the partnership deed date');
          req(['typeFields', 'authorisedPartner'], !!t.authorisedPartner, 'Enter the authorised partner');
          break;
        case 'individual':
          req(['typeFields', 'fatherName'], !!t.fatherName, 'Enter the father’s name');
          req(['typeFields', 'dob'], !!t.dob, 'Enter the date of birth');
          if (t.dob) {
            const age = (Date.now() - Date.parse(t.dob)) / (365.25 * 86400000);
            req(['typeFields', 'dob'], age >= 18, 'The CP must be at least 18 years old');
          }
          break;
      }
    });

export type CpFormValues = z.infer<ReturnType<typeof cpFormSchema>>;

export const agreementFormSchema = z
  .object({
    locationId: z.string().min(1, 'Choose a location'),
    executionDate: z.string().min(1, 'Enter the execution date'),
    executionPlace: z.string().trim().min(2, 'Enter the place of execution'),
    startDate: z.string().min(1, 'Enter the commencement date'),
    endDate: z.string().min(1, 'Enter the expiry date'),
    signatoryName: z.string().trim().min(2, 'Enter the signing authority'),
    signatoryDesignation: z.string().trim().min(2, 'Enter the designation'),
    coordinatorName: z.string().trim().min(2, 'Enter the coordinator'),
  })
  .superRefine((v, ctx) => {
    const errs = agreementDateErrors(v);
    for (const [k, message] of Object.entries(errs)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k], message });
  });

export type AgreementFormValues = z.infer<typeof agreementFormSchema>;

export const stampPaperSchema = z.object({
  number: z.string().trim().min(4, 'Enter the stamp paper number'),
  valueInr: z.coerce.number({ invalid_type_error: 'Enter the value' }).positive('Value must be more than 0'),
  purchaseDate: z.string().min(1, 'Enter the purchase date'),
  state: z.string().min(1, 'Choose the state'),
  vendor: z.string().trim().min(2, 'Enter the vendor'),
});
