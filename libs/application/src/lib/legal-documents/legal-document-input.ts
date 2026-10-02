import type { IsoCountryCode } from '@kometio/shared-types';

/**
 * The wizard's answers (docs/adr/0040) — deliberately pre-fillable from
 * data Kometio already has structured (BusinessInfo, enabledLocales,
 * formSubmissionRetentionDays, the categorized tracker script list) rather
 * than asked blind, the way a generic questionnaire (iubenda's own) has to.
 * Every field here is still admin-editable in the wizard before generating.
 */
export interface LegalDocumentAnswers {
  legalEntityName: string;
  contactEmail: string;
  address: string | null;
  phone: string | null;
  vatId: string | null;
  domain: string | null;
  dataCollected: {
    contactForm: boolean;
    newsletter: boolean;
    accounts: boolean;
  };
  // Vendor labels, e.g. "Google Analytics", "Hotjar" — prefilled from
  // themeTrackerScripts + themeAllowedTrackerDomains, editable.
  thirdPartyServices: string[];
  // null = kept forever (formSubmissionRetentionDays semantics reused).
  retentionDays: number | null;
  // Terms & Conditions only. The code, not a name: each document names the
  // country in its own language (a document in Italian says "Italia", one
  // in English "Italy"), which one name sent for all of them could not.
  jurisdictionCountry: IsoCountryCode;
}
