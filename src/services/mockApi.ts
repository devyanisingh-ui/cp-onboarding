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

export const api = {
  auth: {
    signIn: session.ssoSignIn,
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
    requestDeviation: agreements.requestDeviation,
    decideDeviation: agreements.decideDeviation,
    uploadSigned: agreements.uploadSignedCopy,
    decideGate2: agreements.decideGate2,
    decideRenewal: agreements.decideRenewal,
    confirmNonRenewal: agreements.confirmNonRenewal,
    startTermination: agreements.startTermination,
    confirmTermination: agreements.confirmTermination,
    decideOverride: agreements.decideOverride,
    clearReviewFlag: agreements.clearReviewFlag,
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
  },
};

export type Api = typeof api;
export type { CpListItem, CpDTO, AgreementSummary, AgreementDetail, AgreementActions, CpStatus } from './api/dto';
export { CP_STATUS_META } from './api/dto';
export type { TaskItem, Dashboard } from './api/inbox';
export type { ReportId, ReportResult, ReportFilters } from './api/reports';
export type { CpView } from './api/cps';
export type { LegacyRow, RowValidation } from './api/legacy';
export type { RenderedDocument } from './api/agreements';
