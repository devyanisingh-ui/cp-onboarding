import { defineFeature } from '../../platform/rpc';
import * as s from './settings';
import * as v from './versions';

/**
 * Admin configuration. Same function names as the browser mock's api.config. Importing a Word
 * document as a template (uploadTemplate, importTemplateDocx) arrives with the documents feature,
 * which stores files.
 */
defineFeature('config', {
  lookups: s.lookups,
  saveInstitution: s.saveInstitution,
  saveUser: s.saveUser,
  listRouting: s.listRouting,
  saveRouting: s.saveRouting,
  settings: s.getSettings,
  saveSla: s.saveSla,
  saveMasterLists: s.saveMasterLists,
  saveDomains: s.saveDomains,
  rateCards: v.listRateCards,
  createRateCard: v.createRateCardDraft,
  saveRateCard: v.saveRateCardDraft,
  submitRateCard: v.submitRateCard,
  decideRateCard: v.decideRateCard,
  publishRateCard: v.publishRateCard,
  templates: v.listTemplates,
  template: v.getTemplate,
  createTemplateDraft: v.createTemplateDraft,
  saveTemplateDraft: v.saveTemplateDraft,
  submitTemplate: v.submitTemplate,
  discardTemplateDraft: v.discardTemplateDraft,
  decideTemplate: v.decideTemplate,
  publishTemplate: v.publishTemplate,
});

/** For later features. */
export { firstUserWithRole, getInstitution, routeFor, settings } from './settings';
export { retireSupersededRateCards } from './versions';
export { onRateCardPublished, onTemplateInUse } from './hooks';
export { seedConfig } from './seed';
