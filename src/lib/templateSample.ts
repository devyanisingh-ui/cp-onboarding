import type { Agreement, CpMaster, CpType, Institution, RateCard, TemplateVersion } from '@/types';
import { shiftDays, today } from './dates';
import type { MergeContext } from './agreementTemplate';

/**
 * Fictional sample data for the template editor's live preview, so editing a template
 * never shows a real partner's PAN or bank details.
 */
const SAMPLE_CP: Record<CpType, Pick<CpMaster, 'legalName' | 'pan' | 'residenceAddress' | 'businessAddress' | 'typeFields'>> = {
  sole_prop: { legalName: 'Sample Education Consultants', pan: 'ABCPS1234D', residenceAddress: '12, Sample Nagar, Gurugram', businessAddress: 'SCO 1, Sample Market, Gurugram', typeFields: { proprietorName: 'Asha Sample' } },
  pvt_ltd: { legalName: 'Sample Admissions Pvt. Ltd', pan: 'AABCS1234E', residenceAddress: '', businessAddress: 'Unit 1, Sample Tower, Gurugram', typeFields: { cin: 'U80900HR2020PTC000001', registeredOffice: 'B-1, Sample Enclave, New Delhi', authorisedSignatory: 'Ravi Sample, Director', boardResolutionDate: '2026-01-15' } },
  partnership: { legalName: 'Sample & Co. Associates', pan: 'AABFS1234G', residenceAddress: '3, Sample Road, Ludhiana', businessAddress: '22, Sample Mall Road, Ludhiana', typeFields: { partners: 'Asha Sample, Ravi Sample', deedDate: '2021-04-01', authorisedPartner: 'Asha Sample' } },
  individual: { legalName: 'Asha Sample', pan: 'ABCPS5678H', residenceAddress: '7, Sample Colony, Faridabad', businessAddress: '', typeFields: { fatherName: 'Shri R. Sample', dob: '1985-05-20' } },
};

export function sampleContext(template: TemplateVersion, institution: Institution, rateCard: RateCard): MergeContext {
  const s = SAMPLE_CP[template.cpType];
  const cp: CpMaster = {
    id: 'CP-SAMPLE',
    type: template.cpType,
    ...s,
    contactPerson: 'Asha Sample',
    mobile: '9800000000',
    email: 'asha@sample.example',
    gstRegistered: false,
    bank: { holderName: s.legalName, accountNumber: '000000000000', ifsc: 'SAMP0000001', bankName: 'Sample Bank', branch: 'Main' },
    aadhaarLast4: '0000',
    createdAt: today(),
    createdById: 'system',
  };
  const agreement: Agreement = {
    id: `AGR-${institution.shortCode}-SAMPLE`,
    version: 1,
    cpId: cp.id,
    institutionId: institution.id,
    locationId: institution.locations[0]?.id ?? '',
    templateVersionId: template.id,
    rateCardVersionId: rateCard.id,
    executionDate: today(),
    executionPlace: institution.city,
    startDate: shiftDays(today(), 1),
    endDate: shiftDays(today(), 365),
    signatoryName: institution.signatoryName,
    signatoryDesignation: institution.signatoryDesignation,
    coordinatorName: institution.coordinatorName,
    nonStandard: false,
    status: 'draft',
    source: 'app',
    ownerId: 'system',
    createdAt: today(),
    updatedAt: today(),
  };
  return { agreement, cp, institution, rateCard, template, deviations: [] };
}
