import { cookiePolicyTemplate } from './cookie-policy.template';
import { privacyPolicyTemplate } from './privacy-policy.template';
import { termsConditionsTemplate } from './terms-conditions.template';
import type {
  LegalDocumentLocale,
  LegalDocumentTemplate,
} from './legal-document-section';

export const LEGAL_DOCUMENT_KINDS = [
  'privacy-policy',
  'cookie-policy',
  'terms-conditions',
] as const;
export type LegalDocumentKind = (typeof LEGAL_DOCUMENT_KINDS)[number];

export const LEGAL_DOCUMENT_TEMPLATES: Record<
  LegalDocumentKind,
  LegalDocumentTemplate
> = {
  'privacy-policy': privacyPolicyTemplate,
  'cookie-policy': cookiePolicyTemplate,
  'terms-conditions': termsConditionsTemplate,
};

// it/en only in v1 (docs/adr/0040) — a site locale outside that pair falls
// back to the English outline, the closer of the two to a lingua franca
// for legal boilerplate, rather than failing the whole generation.
export function resolveTemplateLocale(locale: string): LegalDocumentLocale {
  return locale === 'it' ? 'it' : 'en';
}

// Root-level default slugs per document/locale — used both by the real
// generator (generate-legal-documents.use-case.ts, appending -2/-3 on
// conflict) and by editor-app to pre-fill the wizard's own slug fields.
export const LEGAL_DOCUMENT_DEFAULT_SLUGS: Record<
  LegalDocumentKind,
  Record<LegalDocumentLocale, string>
> = {
  'privacy-policy': { it: 'privacy-policy', en: 'privacy-policy' },
  'cookie-policy': { it: 'cookie-policy', en: 'cookie-policy' },
  'terms-conditions': {
    it: 'termini-e-condizioni',
    en: 'terms-and-conditions',
  },
};
