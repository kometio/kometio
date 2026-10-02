import type { SiteRecord } from '@kometio/api-contracts';
import {
  formatBusinessAddress,
  type IsoCountryCode,
} from '@kometio/shared-types';
import {
  LEGAL_DOCUMENT_KINDS,
  type LegalDocumentAnswers,
  type LegalDocumentKind,
} from '../../lib/legal-documents-api-client';

export type WizardStep = 'identity' | 'usage' | 'documents' | 'review';
export const STEPS: WizardStep[] = ['identity', 'usage', 'documents', 'review'];

export interface WizardFormValues {
  legalEntityName: string;
  contactEmail: string;
  address: string;
  phone: string;
  vatId: string;
  domain: string;
  dataCollected: {
    contactForm: boolean;
    newsletter: boolean;
    accounts: boolean;
  };
  thirdPartyServices: string[];
  retentionDays: string;
  /** The country's ISO code, or '' until one is chosen; each document says its name in its own language. */
  jurisdictionCountry: IsoCountryCode | '';
  documents: LegalDocumentKind[];
  locales: string[];
  confirmed: boolean;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

export function toDefaultValues(site: SiteRecord): WizardFormValues {
  return {
    legalEntityName: site.name,
    // The site's own email once Business info has one: the wizard asked
    // for it from scratch every time, the one field it could not prefill.
    contactEmail: site.businessEmail ?? '',
    // One line, because a legal document writes it into prose ("con sede
    // in …") rather than onto an envelope. Editable afterwards, like
    // every other prefilled answer here.
    address: site.businessAddress
      ? formatBusinessAddress(site.businessAddress, site.defaultLocale)
      : '',
    phone: site.businessPhone ?? '',
    vatId: '',
    domain: site.domain ?? '',
    dataCollected: { contactForm: false, newsletter: false, accounts: false },
    thirdPartyServices: dedupe([
      ...site.themeTrackerScripts.map((entry) => entry.label),
      ...site.themeAllowedTrackerDomains.map((entry) => entry.label),
    ]),
    retentionDays:
      site.formSubmissionRetentionDays != null
        ? String(site.formSubmissionRetentionDays)
        : '',
    jurisdictionCountry: '',
    // All three to begin with: nobody comes here to generate one of them,
    // and unticking is quicker than finding out there were three.
    documents: [...LEGAL_DOCUMENT_KINDS],
    locales: [...site.enabledLocales],
    confirmed: false,
  };
}

/**
 * What the generator is sent.
 *
 * The country goes as its ISO code: the documents name it themselves, each
 * in its own language. It used to go as one name in the site's language,
 * which put "Italia" into the English document too.
 */
export function toAnswers(values: WizardFormValues): LegalDocumentAnswers {
  const retentionDays = values.retentionDays.trim();
  const jurisdictionCountry = values.jurisdictionCountry;
  // The documents step has already refused an empty one; a value that got
  // here without a country is a bug in the steps, not something to send.
  if (jurisdictionCountry === '') {
    throw new Error(
      'The wizard reached the end without a jurisdiction country',
    );
  }
  return {
    legalEntityName: values.legalEntityName.trim(),
    contactEmail: values.contactEmail.trim(),
    address: values.address.trim() || null,
    phone: values.phone.trim() || null,
    vatId: values.vatId.trim() || null,
    domain: values.domain.trim() || null,
    dataCollected: values.dataCollected,
    thirdPartyServices: values.thirdPartyServices,
    retentionDays: retentionDays ? Number(retentionDays) : null,
    jurisdictionCountry,
  };
}

export const STEP_FIELDS: Record<WizardStep, (keyof WizardFormValues)[]> = {
  identity: ['legalEntityName', 'contactEmail', 'domain'],
  usage: ['retentionDays', 'thirdPartyServices'],
  documents: ['documents', 'locales', 'jurisdictionCountry'],
  review: ['confirmed'],
};
