/**
 * Single entry point for all data access. Every function is async and shaped like a REST call
 * (e.g. `api.agreements.submit(id)` ≈ `POST /agreements/:id/submit`), so this module can be
 * replaced by a fetch-based client without touching screens.
 */
import * as session from './api/session';
import * as cps from './api/cps';
import * as agreements from './api/agreements';
import * as documents from './api/documents';
import * as inbox from './api/inbox';
import * as config from './api/config';
import * as reports from './api/reports';
import * as legacy from './api/legacy';
import * as esign from './api/esign';
import * as docRequests from './api/docRequests';
import * as contactVerification from './api/contactVerification';
import * as leads from './api/leads';

export const api = {
  auth: {
    signIn: session.passwordSignIn,
    signOut: session.signOut,
    currentUser: session.currentUser,
    demoAccounts: session.demoAccounts,
    switchPersona: session.switchPersona,
    personas: session.PERSONAS,
  },
  cps: {
    list: cps.listCps,
    get: cps.getCp,
    checkPan: cps.checkPan,
    getForEdit: cps.getCpForEdit,
    update: cps.updateCp,
    reveal: cps.revealCpField,
    /** Email the CP a link to verify their email and mobile (also starts by itself when an agreement goes to Legal). */
    sendVerification: contactVerification.sendContactVerification,
  },
  agreements: {
    list: agreements.listAgreements,
    get: agreements.getAgreement,
    render: agreements.renderDocument,
    download: agreements.downloadDocument,
    wizardContext: agreements.wizardContext,
    saveWizardDraft: agreements.saveWizardDraft,
    listWizardDrafts: agreements.listWizardDrafts,
    getWizardDraft: agreements.getWizardDraft,
    discardWizardDraft: agreements.discardWizardDraft,
    saveCpAndDraft: agreements.saveCpAndDraft,
    saveFields: agreements.saveAgreementFields,
    submit: agreements.submitForApproval,
    decideGate1: agreements.decideGate1,
    requestDocChanges: docRequests.requestDocChanges,
    sendDocRequestLink: docRequests.sendDocRequestLink,
    acceptCpDocs: docRequests.acceptCpDocs,
    requestDeviation: agreements.requestDeviation,
    decideDeviation: agreements.decideDeviation,
    decideDeviations: agreements.decideDeviations,
    uploadSigned: agreements.uploadSignedCopy,
    decideGate2: agreements.decideGate2,
    decideRenewal: agreements.decideRenewal,
    confirmNonRenewal: agreements.confirmNonRenewal,
    startTermination: agreements.startTermination,
    confirmTermination: agreements.confirmTermination,
    decideOverride: agreements.decideOverride,
    clearReviewFlag: agreements.clearReviewFlag,
    sendForSignature: esign.sendForSignature,
    resendSignatureEmail: esign.resendSignatureEmail,
    cancelSignature: esign.cancelSignature,
    defaultCpSigner: esign.defaultCpSigner,
  },
  documents: {
    upload: documents.uploadDocument,
    open: documents.openDocument,
    remove: documents.deleteDocument,
    verify: documents.verifyDocument,
  },
  inbox: {
    tasks: inbox.listMyTasks,
    dashboard: inbox.dashboard,
    notifications: inbox.listNotifications,
    unreadCount: inbox.unreadCount,
    markRead: inbox.markNotificationsRead,
    audit: inbox.listAudit,
    emails: inbox.listEmails,
    sms: inbox.listSms,
  },
  config: {
    lookups: config.lookups,
    saveInstitution: config.saveInstitution,
    saveUser: config.saveUser,
    listRouting: config.listRouting,
    saveRouting: config.saveRouting,
    settings: config.getSettings,
    saveSla: config.saveSla,
    saveMasterLists: config.saveMasterLists,
    saveDomains: config.saveDomains,
    rateCards: config.listRateCards,
    createRateCard: config.createRateCardDraft,
    saveRateCard: config.saveRateCardDraft,
    submitRateCard: config.submitRateCard,
    decideRateCard: config.decideRateCard,
    publishRateCard: config.publishRateCard,
    templates: config.listTemplates,
    template: config.getTemplate,
    createTemplateDraft: config.createTemplateDraft,
    saveTemplateDraft: config.saveTemplateDraft,
    submitTemplate: config.submitTemplate,
    discardTemplateDraft: config.discardTemplateDraft,
    uploadTemplate: config.uploadTemplate,
    importTemplateDocx: config.importTemplateDocx,
    decideTemplate: config.decideTemplate,
    publishTemplate: config.publishTemplate,
  },
  reports: { list: reports.REPORTS, run: reports.runReport },
  legacy: {
    columns: legacy.LEGACY_COLUMNS,
    preview: legacy.previewLegacyImport,
    import: legacy.importLegacy,
    batches: legacy.listLegacyBatches,
  },
  system: {
    runJobs: session.runJobsNow,
    setSimulateErrors: session.setSimulateErrors,
    reset: session.resetDemoData,
    clearRecords: session.clearAllRecords,
  },
  /** Public signing links (signers have no app account; the link token is their credential). */
  signing: {
    session: esign.getSigningSession,
    sign: esign.signWithToken,
    decline: esign.declineWithToken,
  },
  /** Leads and revenue per CP, pulled from the CRM (Admin corrects). */
  leads: {
    forCp: leads.getCpLeads,
    correct: leads.correctLead,
    setPartnerCode: leads.setCrmPartnerCode,
    syncNow: leads.syncCrmNow,
    status: leads.crmStatus,
  },
  /** Public CP link for verifying their email and mobile (the link token is the credential). */
  verifyContact: {
    session: contactVerification.getVerifySession,
    confirmEmail: contactVerification.confirmEmail,
    sendCode: contactVerification.sendMobileCode,
    verifyCode: contactVerification.verifyMobileCode,
  },
  /** Public CP links for re-uploading documents Legal flagged (the link token is the credential). */
  cpDocs: {
    session: docRequests.getCpDocSession,
    upload: docRequests.uploadCpDoc,
    submit: docRequests.submitCpDocs,
  },
};

export type Api = typeof api;
export type { ContactVerifySession } from './api/contactVerification';
export type { CpLeadsView, LeadTotals } from './api/leads';
export { LEAD_STATUS_LABELS } from './api/leads';
export type { CpListItem, CpDTO, AgreementSummary, AgreementDetail, AgreementActions, CpStatus } from './api/dto';
export { CP_STATUS_META } from './api/dto';
export type { TaskItem, Dashboard } from './api/inbox';
export type { ReportId, ReportResult, ReportFilters } from './api/reports';
export type { CpView } from './api/cps';
export type { LegacyRow, RowValidation } from './api/legacy';
export type { RenderedDocument } from './api/agreements';
export type { SigningSession, SignatureInput, SignerInput } from './api/esign';
export { SIGN_METHOD_LABELS } from './api/esign';
export type { CpDocSession } from './api/docRequests';
