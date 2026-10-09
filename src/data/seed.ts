import type {
  Agreement,
  AuditEvent,
  CpMaster,
  Database,
  Deviation,
  DocumentRecord,
  DocumentType,
  Institution,
  RateCard,
  Task,
  TaskType,
  TemplateVersion,
  User,
} from '@/types';
import { addWorkingDays, shiftDays, today } from '@/lib/dates';

export const SCHEMA_VERSION = 4;

/** Seed data is generated relative to today so SLAs, expiries and overdue items always look live. */
export function buildSeed(): Database {
  const T = today();
  const d = (n: number) => shiftDays(T, n);
  const ts = (n: number, hour = 10) => `${d(n)}T${String(hour).padStart(2, '0')}:30:00.000Z`;

  // ---------------- Master data ----------------
  const regions = [
    { id: 'north', name: 'North (Delhi NCR, Haryana, Punjab)' },
    { id: 'west', name: 'West (Maharashtra)' },
  ];

  const institutions: Institution[] = [
    {
      id: 'inst-asu',
      legalName: 'Apeejay Stya University',
      shortCode: 'ASU',
      type: 'university',
      legalStatus: 'a State Private University established under the Haryana Private Universities Act, 2006 and recognised by the UGC',
      registeredAddress: 'Sohna–Palwal Road, Sohna, Gurugram, Haryana 122103',
      city: 'Gurugram',
      state: 'Haryana',
      regionId: 'north',
      jurisdictionCourt: 'Gurugram, Haryana',
      arbitrationSeat: 'New Delhi',
      locations: [
        { id: 'loc-asu-main', name: 'Main Campus, Sohna', city: 'Gurugram' },
        { id: 'loc-asu-city', name: 'City Admissions Office', city: 'New Delhi' },
      ],
      signatoryName: 'Prof. Alok Verma',
      signatoryDesignation: 'Registrar',
      coordinatorName: 'Ms. Ritu Anand, Admissions Office',
      programmeGroups: ['Engineering', 'Management', 'Law', 'Design & Visual Arts', 'Sciences & Pharmacy'],
      active: true,
    },
    {
      id: 'inst-aks',
      legalName: 'Apeejay School, Kharghar',
      shortCode: 'AKS',
      type: 'school',
      legalStatus: 'a school run by Apeejay Education Society, a society registered under the Societies Registration Act, 1860',
      registeredAddress: 'Sector 21, Kharghar, Navi Mumbai, Maharashtra 410210',
      city: 'Navi Mumbai',
      state: 'Maharashtra',
      regionId: 'west',
      jurisdictionCourt: 'Navi Mumbai, Maharashtra',
      arbitrationSeat: 'New Delhi',
      locations: [{ id: 'loc-aks-main', name: 'Kharghar Campus', city: 'Navi Mumbai' }],
      signatoryName: 'Mrs. Deepa Nair',
      signatoryDesignation: 'Principal',
      coordinatorName: 'Mr. Sanjay Patil, Front Office',
      programmeGroups: ['Pre-primary', 'Primary', 'Middle', 'Secondary'],
      active: true,
    },
  ];

  const users: User[] = [
    { id: 'u-neha', name: 'Neha Kapoor', email: 'neha.kapoor@apeejay.edu', designation: 'BD Executive', roles: ['bd_exec'], regionId: 'north', institutionIds: ['inst-asu', 'inst-aks'], managerId: 'u-arjun', active: true },
    { id: 'u-priya', name: 'Priya Sharma', email: 'priya.sharma@apeejay.edu', designation: 'Legal Counsel', roles: ['legal'], regionId: 'north', institutionIds: ['inst-asu', 'inst-aks'], managerId: 'u-arjun', active: true },
    { id: 'u-arjun', name: 'Arjun Mehta', email: 'arjun.mehta@apeejay.edu', designation: 'Central Admin', roles: ['admin'], regionId: 'north', institutionIds: ['inst-asu', 'inst-aks'], active: true },
  ];

  // ---------------- Rate cards ----------------
  const asuRows = (bump: number) => [
    { id: 'r-eng', programmeGroup: 'Engineering', programmes: 'B.Tech (CSE, ECE, ME), M.Tech', slabs: { '1-10': 15000 + bump, '11-15': 18000 + bump, '16-20': 21000 + bump, '21+': 25000 + bump } },
    { id: 'r-mgmt', programmeGroup: 'Management', programmes: 'BBA, MBA, B.Com (Hons.)', slabs: { '1-10': 12000 + bump, '11-15': 14000 + bump, '16-20': 16000 + bump, '21+': 19000 + bump } },
    { id: 'r-law', programmeGroup: 'Law', programmes: 'BA LLB, BBA LLB, LLB', slabs: { '1-10': 14000 + bump, '11-15': 16000 + bump, '16-20': 18000 + bump, '21+': 21000 + bump } },
    { id: 'r-design', programmeGroup: 'Design & Visual Arts', programmes: 'B.Des, BFA, B.Sc. Animation', slabs: { '1-10': 11000 + bump, '11-15': 13000 + bump, '16-20': 15000 + bump, '21+': 17000 + bump } },
    { id: 'r-sci', programmeGroup: 'Sciences & Pharmacy', programmes: 'B.Pharm, B.Sc. (Hons.), M.Sc.', slabs: { '1-10': 10000 + bump, '11-15': 12000 + bump, '16-20': 14000 + bump, '21+': 16000 + bump } },
  ];
  const rateCards: RateCard[] = [
    { id: 'rc-asu-1', institutionId: 'inst-asu', version: 1, effectiveFrom: d(-560), status: 'retired', applyMode: 'new_only', rows: asuRows(0), extras: [{ id: 'x-schol', label: 'Scholarship bonus', amountInr: 2000, unit: 'per student admitted on an Apeejay merit scholarship' }], createdById: 'u-arjun', createdAt: ts(-570), approvedById: 'u-priya', approvedAt: ts(-566), publishedById: 'u-arjun', publishedAt: ts(-565) },
    { id: 'rc-asu-2', institutionId: 'inst-asu', version: 2, effectiveFrom: d(-240), status: 'published', applyMode: 'new_only', rows: asuRows(1000), extras: [{ id: 'x-schol', label: 'Scholarship bonus', amountInr: 2500, unit: 'per student admitted on an Apeejay merit scholarship' }], notes: 'Annual revision for the admission cycle.', createdById: 'u-arjun', createdAt: ts(-250), approvedById: 'u-priya', approvedAt: ts(-247), publishedById: 'u-arjun', publishedAt: ts(-246) },
    { id: 'rc-asu-3', institutionId: 'inst-asu', version: 3, effectiveFrom: d(45), status: 'pending_approval', applyMode: 'new_only', rows: asuRows(2000), extras: [{ id: 'x-schol', label: 'Scholarship bonus', amountInr: 3000, unit: 'per student admitted on an Apeejay merit scholarship' }], notes: 'Proposed revision: +INR 1,000 on every slab.', createdById: 'u-arjun', createdAt: ts(-2) },
    {
      id: 'rc-aks-1', institutionId: 'inst-aks', version: 1, effectiveFrom: d(-400), status: 'published', applyMode: 'new_only',
      rows: [
        { id: 'r-pre', programmeGroup: 'Pre-primary', programmes: 'Nursery, KG', slabs: { '1-10': 5000, '11-15': 6000, '16-20': 7000, '21+': 8000 } },
        { id: 'r-pri', programmeGroup: 'Primary', programmes: 'Classes I–V', slabs: { '1-10': 6000, '11-15': 7000, '16-20': 8000, '21+': 9500 } },
        { id: 'r-mid', programmeGroup: 'Middle', programmes: 'Classes VI–VIII', slabs: { '1-10': 7000, '11-15': 8000, '16-20': 9000, '21+': 10500 } },
        { id: 'r-sec', programmeGroup: 'Secondary', programmes: 'Classes IX–XII', slabs: { '1-10': 8000, '11-15': 9000, '16-20': 10000, '21+': 12000 } },
      ],
      extras: [], createdById: 'u-arjun', createdAt: ts(-410), approvedById: 'u-priya', approvedAt: ts(-405), publishedById: 'u-arjun', publishedAt: ts(-404),
    },
  ];

  // ---------------- Templates ----------------
  const tpl = (id: string, cpType: TemplateVersion['cpType'], version: number, status: TemplateVersion['status'], institutionId: string | null, daysAgo: number, note: string): TemplateVersion => ({
    id, cpType, version, status, institutionId,
    fileName: `CP_Agreement_${cpType}_v${version}.docx`,
    effectiveFrom: d(-daysAgo),
    changeNote: note,
    uploadedById: 'u-arjun',
    uploadedAt: ts(Math.min(-daysAgo - 5, -1)),
    ...(status !== 'draft' && status !== 'pending_approval' ? { approvedById: 'u-priya', approvedAt: ts(-daysAgo - 2) } : {}),
    ...(status === 'published' || status === 'retired' ? { publishedById: 'u-arjun', publishedAt: ts(-daysAgo) } : {}),
  });
  const templates: TemplateVersion[] = [
    tpl('tpl-sp-1', 'sole_prop', 1, 'retired', null, 600, 'Initial Legal-vetted template.'),
    tpl('tpl-sp-2', 'sole_prop', 2, 'published', null, 200, 'Removed stray "Name of the Individual" signature block; merge fields replace highlights.'),
    tpl('tpl-pl-1', 'pvt_ltd', 1, 'published', null, 200, 'Initial Legal-vetted template.'),
    tpl('tpl-pa-1', 'partnership', 1, 'published', null, 200, 'Initial Legal-vetted template.'),
    tpl('tpl-pa-2', 'partnership', 2, 'pending_approval', null, -30, 'Adds authorised-partner resolution clause.'),
    tpl('tpl-in-1', 'individual', 1, 'published', null, 200, 'Initial Legal-vetted template.'),
  ];
  const tplFor = { sole_prop: 'tpl-sp-2', pvt_ltd: 'tpl-pl-1', partnership: 'tpl-pa-1', individual: 'tpl-in-1' } as const;

  // ---------------- CPs ----------------
  const bank = (holder: string, acc: string, ifsc: string, bankName: string, branch: string) => ({ holderName: holder, accountNumber: acc, ifsc, bankName, branch });
  const consent = (by: string, n: number) => ({ statement: CONSENT_STATEMENT, recordedAt: ts(n), recordedById: by });
  const cp = (c: Omit<CpMaster, 'createdAt' | 'createdById' | 'consent'> & { by?: string; at?: number }): CpMaster => {
    const { by = 'u-neha', at = -300, ...rest } = c;
    return { ...rest, createdAt: ts(at), createdById: by, consent: consent(by, at) };
  };
  const cps: CpMaster[] = [
    cp({ id: 'CP-0001', type: 'sole_prop', legalName: 'Bright Future Education Consultants', pan: 'ABFPM1234K', contactPerson: 'Sandeep Malik', mobile: '9812345670', email: 'sandeep@brightfuture.in', residenceAddress: 'H.No. 221, Sector 15, Gurugram, Haryana 122001', businessAddress: 'SCO 44, Sector 14 Market, Gurugram, Haryana 122001', gstRegistered: true, gstin: '06ABFPM1234K1Z5', bank: bank('Bright Future Education Consultants', '50100234567812', 'HDFC0001234', 'HDFC Bank', 'Sector 14, Gurugram'), aadhaarLast4: '4821', typeFields: { proprietorName: 'Sandeep Malik' }, at: -600 }),
    cp({ id: 'CP-0002', type: 'sole_prop', legalName: 'Pathway Admissions Hub', pan: 'BKLPM4521Q', contactPerson: 'Anita Mehra', mobile: '9876501234', email: 'anita@pathwayhub.in', residenceAddress: '12 Model Town, Rohtak, Haryana 124001', businessAddress: 'First Floor, Delhi Road, Rohtak, Haryana 124001', gstRegistered: false, bank: bank('Anita Mehra', '3345678901', 'SBIN0001567', 'State Bank of India', 'Rohtak Main'), aadhaarLast4: '1190', typeFields: { proprietorName: 'Anita Mehra' }, at: -330 }),
    cp({ id: 'CP-0003', type: 'sole_prop', legalName: 'Career Compass', pan: 'CJHPK7788R', contactPerson: 'Vikas Kumar', mobile: '9990012345', email: 'vikas@careercompass.co.in', residenceAddress: '88 NIT, Faridabad, Haryana 121001', businessAddress: 'Shop 5, Neelam Chowk, Faridabad, Haryana 121001', gstRegistered: false, bank: bank('Vikas Kumar', '7788990011', 'PUNB0123400', 'Punjab National Bank', 'Neelam Chowk'), aadhaarLast4: '7342', typeFields: { proprietorName: 'Vikas Kumar' }, at: -340 }),
    cp({ id: 'CP-0004', type: 'pvt_ltd', legalName: 'EduBridge Services Pvt. Ltd', pan: 'AAECE5566D', contactPerson: 'Rahul Bhatia', mobile: '9811122233', email: 'rahul@edubridge.in', residenceAddress: '', businessAddress: 'Unit 402, Tower B, Cyber City, Gurugram, Haryana 122002', gstRegistered: true, gstin: '06AAECE5566D1Z9', bank: bank('EduBridge Services Pvt. Ltd', '918020045566123', 'UTIB0000123', 'Axis Bank', 'Cyber City'), aadhaarLast4: '5566', typeFields: { cin: 'U80900DL2018PTC334455', registeredOffice: 'B-12, Lajpat Nagar II, New Delhi 110024', authorisedSignatory: 'Rahul Bhatia, Director', boardResolutionDate: d(-30) }, at: -20 }),
    cp({ id: 'CP-0005', type: 'pvt_ltd', legalName: 'Scholars Gateway India Pvt. Ltd', pan: 'AAFCS9012L', contactPerson: 'Pooja Arora', mobile: '9910987654', email: 'pooja@scholarsgateway.in', residenceAddress: '', businessAddress: '3rd Floor, Vipul Plaza, Sohna Road, Gurugram 122018', gstRegistered: true, gstin: '06AAFCS9012L1ZQ', bank: bank('Scholars Gateway India Pvt. Ltd', '001234567890', 'ICIC0000456', 'ICICI Bank', 'Sohna Road'), aadhaarLast4: '9012', typeFields: { cin: 'U85300HR2020PTC089012', registeredOffice: '3rd Floor, Vipul Plaza, Sohna Road, Gurugram 122018', authorisedSignatory: 'Pooja Arora, Director', boardResolutionDate: d(-15) }, at: -10 }),
    cp({ id: 'CP-0006', type: 'pvt_ltd', legalName: 'NextStep Learning Pvt. Ltd', pan: 'AAGCN3456M', contactPerson: 'Harpreet Singh', mobile: '9876012345', email: 'harpreet@nextstep.co.in', residenceAddress: '', businessAddress: 'SCO 118, Sector 17-C, Chandigarh 160017', gstRegistered: true, gstin: '04AAGCN3456M1Z2', bank: bank('NextStep Learning Pvt. Ltd', '60234567123', 'KKBK0000789', 'Kotak Mahindra Bank', 'Sector 17'), aadhaarLast4: '3456', typeFields: { cin: 'U80301CH2019PTC043456', registeredOffice: 'SCO 118, Sector 17-C, Chandigarh 160017', authorisedSignatory: 'Harpreet Singh, Director', boardResolutionDate: d(-12) }, at: -8 }),
    cp({ id: 'CP-0007', type: 'partnership', legalName: 'Sharma & Gill Associates', pan: 'AAQFS2345B', contactPerson: 'Manpreet Gill', mobile: '9815098150', email: 'contact@sharmagill.in', residenceAddress: '', businessAddress: '22 Mall Road, Ludhiana, Punjab 141001', gstRegistered: false, bank: bank('Sharma & Gill Associates', '12340056789', 'HDFC0000555', 'HDFC Bank', 'Mall Road, Ludhiana'), aadhaarLast4: '2345', typeFields: { partners: 'Amit Sharma, Manpreet Gill', deedDate: d(-900), authorisedPartner: 'Manpreet Gill' }, at: -14 }),
    cp({ id: 'CP-0008', type: 'partnership', legalName: 'Vidya Partners', pan: 'AAKFV6789C', contactPerson: 'Suresh Rao', mobile: '9822012345', email: 'suresh@vidyapartners.in', residenceAddress: '', businessAddress: 'Office 7, Palm Beach Road, Vashi, Navi Mumbai 400703', gstRegistered: true, gstin: '27AAKFV6789C1Z1', bank: bank('Vidya Partners', '44556677889', 'SBIN0004455', 'State Bank of India', 'Vashi'), aadhaarLast4: '6789', typeFields: { partners: 'Suresh Rao, Lata Rao', deedDate: d(-1200), authorisedPartner: 'Suresh Rao' }, by: 'u-neha', at: -380 }),
    cp({ id: 'CP-0009', type: 'partnership', legalName: 'Horizon Admission Consultants', pan: 'AAJFH1122E', contactPerson: 'Deepak Jain', mobile: '9867012345', email: 'deepak@horizonadm.in', residenceAddress: '', businessAddress: 'B-14, Sector 8, Kharghar, Navi Mumbai 410210', gstRegistered: false, bank: bank('Horizon Admission Consultants', '22334455667', 'BARB0KHARGH', 'Bank of Baroda', 'Kharghar'), aadhaarLast4: '1122', typeFields: { partners: 'Deepak Jain, Nitin Jain', deedDate: d(-1500), authorisedPartner: 'Deepak Jain' }, by: 'u-neha', at: -500,
      warning: { reason: 'Agreement AGR-AKS-2025-0011 terminated for breach: collected fees from applicants in cash.', setAt: ts(-60), setById: 'u-arjun', sourceAgreementId: 'AGR-AKS-2025-0011' } }),
    cp({ id: 'CP-0010', type: 'individual', legalName: 'Ramesh Chandra Yadav', pan: 'AEYPY4455F', contactPerson: 'Ramesh Chandra Yadav', mobile: '9812098120', email: 'ramesh.yadav@gmail.com', residenceAddress: 'Village Dhankot, Tehsil Gurugram, Haryana 122505', businessAddress: '', gstRegistered: false, bank: bank('Ramesh Chandra Yadav', '9900112233', 'CNRB0001234', 'Canara Bank', 'Gurugram'), aadhaarLast4: '4455', typeFields: { fatherName: 'Shri Mahavir Yadav', dob: '1981-06-14' }, at: -40 }),
    cp({ id: 'CP-0011', type: 'individual', legalName: 'Kavita Joshi', pan: 'BHNPJ6677G', contactPerson: 'Kavita Joshi', mobile: '9820098200', email: 'kavita.joshi@outlook.com', residenceAddress: 'Flat 1203, Sea Breeze, Sector 20, Kharghar, Navi Mumbai 410210', businessAddress: '', gstRegistered: false, bank: bank('Kavita Joshi', '5566778899', 'HDFC0000999', 'HDFC Bank', 'Kharghar'), aadhaarLast4: '6677', typeFields: { fatherName: 'Shri Prakash Joshi', dob: '1986-11-02' }, by: 'u-neha', at: -700 }),
    cp({ id: 'CP-0012', type: 'individual', legalName: 'Mohammed Irfan', pan: 'CQRPI8899H', contactPerson: 'Mohammed Irfan', mobile: '9958099580', email: 'irfan.m@gmail.com', residenceAddress: 'House 9, Old Faridabad, Haryana 121002', businessAddress: '', gstRegistered: false, bank: bank('Mohammed Irfan', '1122334455', 'IDIB000F012', 'Indian Bank', 'Old Faridabad'), aadhaarLast4: '8899', typeFields: { fatherName: 'Shri Abdul Rashid', dob: '1978-03-21' }, at: -800 }),
  ];
  const cpById = Object.fromEntries(cps.map((c) => [c.id, c]));

  // ---------------- Agreements ----------------
  const inst = { asu: institutions[0]!, aks: institutions[1]! };
  const ag = (a: Partial<Agreement> & Pick<Agreement, 'id' | 'cpId' | 'status'> & { i?: 'asu' | 'aks'; created: number }): Agreement => {
    const { i = 'asu', created, ...rest } = a;
    const institution = inst[i];
    const c = cpById[a.cpId]!;
    return {
      version: 1,
      institutionId: institution.id,
      locationId: institution.locations[0]!.id,
      templateVersionId: tplFor[c.type],
      rateCardVersionId: i === 'asu' ? 'rc-asu-2' : 'rc-aks-1',
      signatoryName: institution.signatoryName,
      signatoryDesignation: institution.signatoryDesignation,
      coordinatorName: institution.coordinatorName,
      nonStandard: false,
      source: 'app',
      ownerId: 'u-neha',
      createdAt: ts(created),
      updatedAt: ts(created),
      executionPlace: institution.city,
      ...rest,
    };
  };
  const stamp = (n: number, st: string, created: number) => ({ number: `IN-${st === 'Haryana' ? 'HR' : 'MH'}${String(48213 + n * 97).padStart(8, '0')}`, valueInr: 100, purchaseDate: d(created), state: st, vendor: st === 'Haryana' ? 'Gurugram Stamp Vendor, Tehsil Office' : 'Kharghar Stamp Vendor' });

  const agreements: Agreement[] = [
    ag({ id: 'AGR-ASU-2025-0012', cpId: 'CP-0001', status: 'expired', created: -590, rateCardVersionId: 'rc-asu-1', templateVersionId: 'tpl-sp-1', executionDate: d(-566), startDate: d(-565), endDate: d(-201), activatedAt: ts(-566), successorId: 'AGR-ASU-2026-0001', stampPaper: stamp(12, 'Haryana', -568), signedOn: d(-567), closedAt: ts(-200), renewal: { decision: 'renew', decidedById: 'u-neha', decidedAt: ts(-230), successorId: 'AGR-ASU-2026-0001' } }),
    ag({ id: 'AGR-ASU-2026-0001', cpId: 'CP-0001', status: 'active', created: -230, executionDate: d(-205), startDate: d(-200), endDate: d(165), activatedAt: ts(-204), predecessorId: 'AGR-ASU-2025-0012', submittedAt: ts(-228), stampPaper: stamp(1, 'Haryana', -210), signedOn: d(-206) }),
    ag({ id: 'AGR-ASU-2025-0002', cpId: 'CP-0002', status: 'active', created: -330, executionDate: d(-321), startDate: d(-320), endDate: d(45), activatedAt: ts(-318), submittedAt: ts(-328), stampPaper: stamp(2, 'Haryana', -324), signedOn: d(-322) }),
    ag({ id: 'AGR-ASU-2025-0003', cpId: 'CP-0003', status: 'active', created: -340, executionDate: d(-341), startDate: d(-340), endDate: d(25), activatedAt: ts(-337), submittedAt: ts(-339), stampPaper: stamp(3, 'Haryana', -343), signedOn: d(-342), renewal: { decision: 'do_not_renew', reason: 'Low conversions (fewer than 5 admissions this cycle)', decidedById: 'u-neha', decidedAt: ts(-4), confirmation: 'pending' } }),
    ag({ id: 'AGR-ASU-2026-0004', cpId: 'CP-0004', status: 'pending_approval', created: -12, nonStandard: true, executionDate: d(10), startDate: d(12), endDate: d(376), submittedAt: ts(-8) }),
    ag({ id: 'AGR-ASU-2026-0005', cpId: 'CP-0005', status: 'approved_for_signing', created: -6, executionDate: d(8), startDate: d(10), endDate: d(374), submittedAt: ts(-1), locationId: 'loc-asu-city', executionPlace: 'New Delhi' }),
    ag({ id: 'AGR-ASU-2026-0006', cpId: 'CP-0006', status: 'draft', created: -4, executionDate: d(14), startDate: d(15), endDate: d(379) }),
    ag({ id: 'AGR-ASU-2026-0007', cpId: 'CP-0007', status: 'draft', created: -13, nonStandard: true, executionDate: d(7), startDate: d(9), endDate: d(373), submittedAt: ts(-8), lastRejection: { gate: 1, byId: 'u-priya', at: ts(-2), comment: 'Partnership deed date does not match the uploaded deed. Please correct and re-upload the PAN copy, which is illegible.' } }),
    ag({ id: 'AGR-ASU-2026-0008', cpId: 'CP-0010', status: 'approved_for_signing', created: -35, executionDate: d(2), startDate: d(3), endDate: d(367), submittedAt: ts(-30), templateVersionId: tplFor.individual }),
    ag({ id: 'AGR-ASU-2026-0009', cpId: 'CP-0012', status: 'signed_copy_uploaded', created: -30, executionDate: d(-6), startDate: d(-5), endDate: d(360), submittedAt: ts(-26), stampPaper: stamp(9, 'Haryana', -8), signedOn: d(-6) }),
    ag({ id: 'AGR-ASU-2024-0010', cpId: 'CP-0011', status: 'signed_copy_uploaded', created: -3, source: 'legacy', legacyBatchId: 'LB-0001', executionDate: d(-420), startDate: d(-418), endDate: d(310), stampPaper: stamp(10, 'Haryana', -421), templateVersionId: 'tpl-in-1', rateCardVersionId: 'rc-asu-1', signedOn: d(-420) }),
    ag({ id: 'AGR-ASU-2025-0016', cpId: 'CP-0002', status: 'signed_copy_uploaded', created: -3, source: 'legacy', legacyBatchId: 'LB-0001', locationId: 'loc-asu-city', executionPlace: 'New Delhi', executionDate: d(-300), startDate: d(-299), endDate: d(430), templateVersionId: 'tpl-sp-1', rateCardVersionId: 'rc-asu-1', stampPaper: stamp(16, 'Haryana', -301) }),
    ag({ id: 'AGR-AKS-2025-0011', i: 'aks', cpId: 'CP-0009', status: 'terminated', created: -500, executionDate: d(-470), startDate: d(-468), endDate: d(-103), activatedAt: ts(-467), stampPaper: stamp(11, 'Maharashtra', -472), signedOn: d(-470), closedAt: ts(-30),
      termination: { type: 'breach', reason: 'Collected fees from applicants in cash', noticeDate: d(-60), effectiveDate: d(-30), noticeDocumentId: 'DOC-T-0011', startedById: 'u-neha', startedAt: ts(-60), confirmation: 'confirmed', confirmedById: 'u-arjun', confirmedAt: ts(-60) } }),
    ag({ id: 'AGR-AKS-2024-0013', i: 'aks', cpId: 'CP-0008', status: 'not_renewed', created: -780, executionDate: d(-406), startDate: d(-405), endDate: d(-40), activatedAt: ts(-404), stampPaper: stamp(13, 'Maharashtra', -407), closedAt: ts(-39), renewal: { decision: 'do_not_renew', reason: 'Partner exiting the education business', decidedById: 'u-neha', decidedAt: ts(-95), confirmation: 'confirmed', confirmedById: 'u-arjun', confirmedAt: ts(-94) } }),
    ag({ id: 'AGR-ASU-2024-0014', cpId: 'CP-0012', status: 'expired_no_decision', created: -390, executionDate: d(-376), startDate: d(-375), endDate: d(-10), activatedAt: ts(-373), stampPaper: stamp(14, 'Haryana', -377), closedAt: ts(-9) }),
    ag({ id: 'AGR-AKS-2026-0015', i: 'aks', cpId: 'CP-0011', status: 'notice_period', created: -250, executionDate: d(-221), startDate: d(-220), endDate: d(145), activatedAt: ts(-218), stampPaper: stamp(15, 'Maharashtra', -222),
      termination: { type: 'convenience', reason: 'Partner relocating out of Navi Mumbai', noticeDate: d(-18), effectiveDate: d(12), noticeDocumentId: 'DOC-T-0015', startedById: 'u-neha', startedAt: ts(-18), confirmation: 'confirmed', confirmedById: 'u-arjun', confirmedAt: ts(-17) } }),
    ag({ id: 'AGR-AKS-2026-0017', i: 'aks', cpId: 'CP-0008', status: 'draft', created: -1, executionDate: d(20), startDate: d(21) }),
  ];

  // ---------------- Deviations ----------------
  const deviations: Deviation[] = [
    { id: 'DEV-0001', agreementId: 'AGR-ASU-2026-0004', type: 'rate', ref: 'r-eng:21+', label: 'Engineering · 21+ admissions', standardValue: '26000', proposedValue: '29000', agreedValue: '28000', reason: 'EduBridge brought 40+ engineering admissions last cycle through another university; matching competitive offer.', requestedById: 'u-neha', requestedAt: ts(-10), status: 'approved', decidedById: 'u-priya', decidedAt: ts(-7), legalComment: 'Agreed at 28,000 — within the 10% band Finance allows for top performers.' },
    { id: 'DEV-0002', agreementId: 'AGR-ASU-2026-0004', type: 'clause', ref: 'c4', label: 'Clause 4 · Consideration and payment', standardValue: 'Payment within 45 days of the close of the admission cycle.', proposedValue: 'For every student admitted through the Channel Partner who has paid the first-year fee in full and has not withdrawn within the refund period, the Institution shall pay the consideration set out in Annexure-B. Payment shall be made within 30 days of the close of each admission month against a valid invoice, subject to deduction of tax at source.', agreedValue: 'For every student admitted through the Channel Partner who has paid the first-year fee in full and has not withdrawn within the refund period, the Institution shall pay the consideration set out in Annexure-B. Payment shall be made within 30 days of the close of each admission month against a valid invoice, subject to deduction of tax at source.', reason: 'Partner requests monthly settlement due to its payroll cycle.', requestedById: 'u-neha', requestedAt: ts(-10), status: 'approved', decidedById: 'u-priya', decidedAt: ts(-7), legalComment: 'Monthly settlement acceptable.' },
    { id: 'DEV-0004', agreementId: 'AGR-ASU-2026-0007', type: 'rate', ref: 'r-mgmt:1-10', label: 'Management · 1-10 admissions', standardValue: '13000', proposedValue: '14500', agreedValue: '14000', reason: 'Ludhiana market: partner has an established BBA referral base and a competing offer.', requestedById: 'u-neha', requestedAt: ts(-11), status: 'approved', decidedById: 'u-priya', decidedAt: ts(-9), legalComment: 'Agreed at 14,000 for the first slab only.' },
    { id: 'DEV-0003', agreementId: 'AGR-ASU-2026-0006', type: 'rate', ref: 'r-mgmt:11-15', label: 'Management · 11-15 admissions', standardValue: '15000', proposedValue: '16500', reason: 'Chandigarh market: competing universities pay INR 16,000+ for MBA referrals.', requestedById: 'u-neha', requestedAt: ts(-2), status: 'pending' },
  ];

  // ---------------- Documents ----------------
  const docs: DocumentRecord[] = [];
  let docN = 1;
  const doc = (ownerType: DocumentRecord['ownerType'], ownerId: string, type: DocumentType, fileName: string, uploadedById: string, at: number, extra: Partial<DocumentRecord> = {}) => {
    docs.push({ id: extra.id ?? `DOC-${String(docN++).padStart(4, '0')}`, ownerType, ownerId, type, fileName, mimeType: fileName.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg', size: 180_000 + ((docN * 7919) % 400_000), uploadedById, uploadedAt: ts(at), verificationStatus: 'pending', retentionUntil: d(365 * 8 + 400), ...extra });
  };
  for (const c of cps) {
    const verified = !['CP-0006', 'CP-0005', 'CP-0004', 'CP-0007'].includes(c.id);
    const v = verified ? { verificationStatus: 'verified' as const, verifiedById: 'u-arjun', verifiedOn: c.createdAt, verificationMethod: 'manual' as const } : {};
    const days = Math.round((Date.parse(c.createdAt) - Date.parse(T)) / 86400000);
    doc('cp', c.id, 'pan', `PAN_${c.id}.jpg`, c.createdById, days, v);
    doc('cp', c.id, 'aadhaar_masked', `Aadhaar_masked_${c.id}.jpg`, c.createdById, days, v);
    doc('cp', c.id, 'cancelled_cheque', `Cheque_${c.id}.jpg`, c.createdById, days, v);
    if (c.gstRegistered) doc('cp', c.id, 'gst_certificate', `GST_${c.id}.pdf`, c.createdById, days, v);
  }
  for (const a of agreements) {
    if (['active', 'expired', 'not_renewed', 'expired_no_decision', 'terminated', 'notice_period'].includes(a.status) || (a.status === 'signed_copy_uploaded' && a.id !== 'AGR-ASU-2025-0016')) {
      const verified = a.status !== 'signed_copy_uploaded';
      const v = verified ? { verificationStatus: 'verified' as const, verifiedById: 'u-arjun', verifiedOn: a.activatedAt, verificationMethod: 'manual' as const } : {};
      doc('agreement', a.id, 'signed_copy', `Signed_${a.id}.pdf`, a.ownerId, -6, { ...v, retentionUntil: shiftDays(a.endDate ?? T, 365 * 8) });
      doc('agreement', a.id, 'stamp_paper_scan', `Stamp_${a.id}.pdf`, a.ownerId, -6, { ...v, retentionUntil: shiftDays(a.endDate ?? T, 365 * 8) });
    }
  }
  doc('agreement', 'AGR-AKS-2025-0011', 'termination_notice', 'Termination_notice_AKS_0011.pdf', 'u-neha', -60, { id: 'DOC-T-0011', retentionUntil: shiftDays(d(-30), 365 * 8) });
  doc('agreement', 'AGR-AKS-2026-0015', 'termination_notice', 'Termination_notice_AKS_0015.pdf', 'u-neha', -18, { id: 'DOC-T-0015', retentionUntil: shiftDays(d(12), 365 * 8) });

  // ---------------- Tasks ----------------
  const tasks: Task[] = [];
  let taskN = 1;
  const task = (type: TaskType, title: string, assigneeId: string, created: number, due: string, extra: Partial<Task> = {}) =>
    tasks.push({ id: `T-${String(taskN++).padStart(4, '0')}`, type, title, assigneeId, createdAt: ts(created), dueDate: due, status: 'open', ...extra });
  task('gate1_approval', 'Legal approval: EduBridge Services Pvt. Ltd', 'u-priya', -8, addWorkingDays(d(-8), 2), { agreementId: 'AGR-ASU-2026-0004', cpId: 'CP-0004', institutionId: 'inst-asu', remindedAt: ts(-1) });
  task('signing_upload', 'Get signed & upload: Scholars Gateway India Pvt. Ltd', 'u-neha', -1, addWorkingDays(d(-1), 10), { agreementId: 'AGR-ASU-2026-0005', cpId: 'CP-0005', institutionId: 'inst-asu' });
  task('deviation_review', 'Review deviation: NextStep Learning Pvt. Ltd', 'u-priya', -2, addWorkingDays(d(-2), 3), { agreementId: 'AGR-ASU-2026-0006', cpId: 'CP-0006', refId: 'DEV-0003', institutionId: 'inst-asu' });
  task('fix_rejected', 'Rework rejected draft: Sharma & Gill Associates', 'u-neha', -2, addWorkingDays(d(-2), 2), { agreementId: 'AGR-ASU-2026-0007', cpId: 'CP-0007', institutionId: 'inst-asu' });
  task('signing_upload', 'Get signed & upload: Ramesh Chandra Yadav', 'u-neha', -14, addWorkingDays(d(-14), 10), { agreementId: 'AGR-ASU-2026-0008', cpId: 'CP-0010', institutionId: 'inst-asu' });
  task('gate2_verification', 'Gate 2 verification: Mohammed Irfan', 'u-arjun', -4, addWorkingDays(d(-4), 3), { agreementId: 'AGR-ASU-2026-0009', cpId: 'CP-0012', institutionId: 'inst-asu' });
  task('gate2_verification', 'Gate 2 verification (Legacy): Kavita Joshi', 'u-arjun', -2, addWorkingDays(d(-2), 3), { agreementId: 'AGR-ASU-2024-0010', cpId: 'CP-0011', institutionId: 'inst-asu' });
  task('legacy_scan_upload', 'Upload legacy scan: Pathway Admissions Hub', 'u-neha', -3, addWorkingDays(d(-3), 10), { agreementId: 'AGR-ASU-2025-0016', cpId: 'CP-0002', institutionId: 'inst-asu' });
  task('renewal_decision', 'Renewal decision due: Pathway Admissions Hub', 'u-neha', -15, d(15), { agreementId: 'AGR-ASU-2025-0002', cpId: 'CP-0002', institutionId: 'inst-asu' });
  task('non_renewal_confirm', 'Confirm "Do not renew": Career Compass', 'u-arjun', -4, addWorkingDays(d(-4), 2), { agreementId: 'AGR-ASU-2025-0003', cpId: 'CP-0003', institutionId: 'inst-asu' });
  task('rate_card_approval', 'Approve rate card: ASU v3', 'u-priya', -2, addWorkingDays(d(-2), 3), { refId: 'rc-asu-3', institutionId: 'inst-asu' });
  task('template_approval', 'Approve template: Partnership v2', 'u-priya', -1, addWorkingDays(d(-1), 3), { refId: 'tpl-pa-2', createdAt: ts(-1) });
  // Mark past ones as done for history.
  task('gate1_approval', 'Legal approval: Sharma & Gill Associates', 'u-priya', -8, addWorkingDays(d(-8), 2), { agreementId: 'AGR-ASU-2026-0007', status: 'done', completedAt: ts(-2), completedById: 'u-priya', institutionId: 'inst-asu' });

  // ---------------- Audit ----------------
  const audit: AuditEvent[] = [];
  let auditN = 1;
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? 'System';
  const ev = (actorId: string, action: string, entityType: string, entityId: string, summary: string, at: string, before?: Record<string, unknown>, after?: Record<string, unknown>) =>
    audit.push({ id: `EV-${String(auditN++).padStart(5, '0')}`, actorId, actorName: nameOf(actorId), action, entityType, entityId, summary, at, before, after, ip: '10.20.4.' + ((auditN * 37) % 250), device: auditN % 3 === 0 ? 'Chrome · Android' : 'Chrome · Windows' });
  for (const a of agreements) {
    ev(a.ownerId, 'create', 'agreement', a.id, a.source === 'legacy' ? 'Imported legacy agreement' : 'Created draft agreement', a.createdAt, undefined, { status: 'draft' });
    if (a.submittedAt) ev(a.ownerId, 'submit', 'agreement', a.id, a.nonStandard ? 'Sent to Legal for approval (Non-standard)' : 'Finalised on standard terms — no Legal approval needed; approved for signing', a.submittedAt, { status: 'draft' }, { status: a.nonStandard ? 'pending_approval' : 'approved_for_signing' });
    if (a.lastRejection) ev(a.lastRejection.byId, 'reject', 'agreement', a.id, `Rejected by Legal: ${a.lastRejection.comment}`, a.lastRejection.at, { status: 'pending_approval' }, { status: 'draft' });
    if (a.activatedAt) ev('u-arjun', 'approve', 'agreement', a.id, 'Gate 2 verified — agreement Active', a.activatedAt, { status: 'signed_copy_uploaded' }, { status: 'active' });
    if (a.closedAt) ev('system', 'status_change', 'agreement', a.id, `Status changed to ${a.status}`, a.closedAt, { status: 'active' }, { status: a.status });
  }
  for (const dv of deviations) {
    ev(dv.requestedById, 'request', 'deviation', dv.id, `Requested ${dv.type} deviation on ${dv.agreementId}: ${dv.label}`, dv.requestedAt, { value: dv.standardValue }, { value: dv.proposedValue });
    if (dv.decidedAt) ev(dv.decidedById!, 'approve', 'deviation', dv.id, `Approved deviation on ${dv.agreementId}`, dv.decidedAt, { value: dv.standardValue }, { value: dv.agreedValue });
  }
  ev('u-arjun', 'create', 'rate_card', 'rc-asu-3', 'Created rate card ASU v3 and sent to Legal', ts(-2));
  ev('u-arjun', 'login', 'session', 'u-arjun', 'Signed in with Google', ts(-1, 9));
  ev('u-priya', 'reveal', 'cp', 'CP-0004', 'Revealed PAN', ts(-3, 11));
  audit.sort((a, b) => a.at.localeCompare(b.at));

  return {
    schemaVersion: SCHEMA_VERSION,
    regions,
    institutions,
    users,
    cps,
    agreements,
    deviations,
    rateCards,
    templates,
    documents: docs,
    tasks,
    notifications: [
      { id: 'N-0001', userId: 'u-priya', title: 'Legal approval overdue', body: 'EduBridge Services Pvt. Ltd · AGR-ASU-2026-0004 is past its SLA.', link: '/agreements/AGR-ASU-2026-0004/preview', createdAt: ts(-1, 9), read: false },
      { id: 'N-0002', userId: 'u-neha', title: 'Draft returned by Legal', body: 'Sharma & Gill Associates · AGR-ASU-2026-0007 was returned by Legal with comments.', link: '/agreements/AGR-ASU-2026-0007', createdAt: ts(-2), read: false },
      { id: 'N-0003', userId: 'u-neha', title: 'Renewal decision due', body: 'Pathway Admissions Hub · AGR-ASU-2025-0002 expires in 45 days.', link: '/agreements/AGR-ASU-2025-0002/renewal', createdAt: ts(-15), read: true },
      { id: 'N-0004', userId: 'u-priya', title: 'Deviation requested', body: 'NextStep Learning Pvt. Ltd · AGR-ASU-2026-0006 needs your review.', link: '/agreements/AGR-ASU-2026-0006/deviation', createdAt: ts(-2), read: false },
      { id: 'N-0005', userId: 'u-arjun', title: 'Signed copy uploaded', body: 'Mohammed Irfan · AGR-ASU-2026-0009 is ready for Gate 2.', link: '/agreements/AGR-ASU-2026-0009/verify', createdAt: ts(-4), read: false },
      { id: 'N-0006', userId: 'u-arjun', title: 'Rate card awaiting Legal', body: 'ASU rate card v3 was sent to Legal for approval.', link: '/admin/rate-cards', createdAt: ts(-2), read: true },
    ],
    emails: [],
    audit,
    routing: [
      // Only non-standard agreements need approval (standard ones go straight to signing).
      { id: 'RR-1', institutionId: 'inst-asu', condition: 'non_standard', approverId: 'u-priya', escalateToId: 'u-arjun' },
      { id: 'RR-2', institutionId: 'inst-aks', condition: 'non_standard', approverId: 'u-priya', escalateToId: 'u-arjun' },
    ],
    masterLists: {
      terminationReasons: ['Breach: fees collected from applicants', 'Breach: misrepresentation to applicants', 'Breach: unauthorised use of brand', 'Partner relocating or closing business', 'Low performance', 'Mutual agreement', 'Other'],
      nonRenewalReasons: ['Low conversions', 'Partner exiting the education business', 'Compliance concerns', 'Territory reorganised', 'Replaced by another partner', 'Other'],
      documentTypes: [
        { id: 'pan', label: 'PAN card' },
        { id: 'aadhaar_masked', label: 'Aadhaar (masked)' },
        { id: 'cancelled_cheque', label: 'Cancelled cheque' },
        { id: 'gst_certificate', label: 'GST certificate' },
        { id: 'draft', label: 'Draft agreement' },
        { id: 'signed_copy', label: 'Signed agreement' },
        { id: 'stamp_paper_scan', label: 'Stamp paper scan' },
        { id: 'termination_notice', label: 'Termination notice' },
        { id: 'template_docx', label: 'Template DOCX' },
        { id: 'other', label: 'Other' },
      ],
      stampStates: ['Delhi', 'Haryana', 'Maharashtra', 'Punjab', 'Uttar Pradesh', 'Rajasthan', 'Karnataka'],
    },
    legacyBatches: [
      { id: 'LB-0001', fileName: 'legacy_asu_batch1.xlsx', uploadedById: 'u-neha', uploadedAt: ts(-3), totalRows: 3, importedIds: ['AGR-ASU-2024-0010', 'AGR-ASU-2025-0016'], errors: [{ row: 4, messages: ['Agreement already expired — expired paper agreements are not imported'] }] },
    ],
    wizardDrafts: [],
    settings: {
      sla: { gate1Days: 2, deviationDays: 3, signingDays: 10, gate2Days: 3, versionApprovalDays: 3, renewalLeadDays: 60, renewalEscalationDays: 30, graceDays: 1, digestHourIst: 9 },
      allowedDomains: ['apeejay.edu', 'apeejay.org'],
      simulateErrors: false,
    },
    counters: { cp: 12, agreement: 17, doc: docN, task: taskN, audit: auditN, dev: 4, notif: 6, email: 0, batch: 1 },
  };
}

export const CONSENT_STATEMENT =
  'The Channel Partner consents to Apeejay Education Society collecting and processing the personal data in this form (identity, contact, bank and KYC documents) solely to execute, administer and pay under the Channel Partner Agreement, and to retain it for 8 years after the agreement ends, in line with the Digital Personal Data Protection Act, 2023.';
