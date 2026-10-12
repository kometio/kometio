import { z } from 'zod';
import {
  isoCountryCodeSchema,
  MAX_THIRD_PARTY_SERVICES,
} from '@kometio/shared-types';

/** `POST /sites/:siteId/legal-documents` and `.../preview`: the documents the wizard generates. */
export const LEGAL_DOCUMENT_KINDS = [
  'privacy-policy',
  'cookie-policy',
  'terms-conditions',
] as const;

export const legalDocumentKindSchema = z.enum(LEGAL_DOCUMENT_KINDS);
export type LegalDocumentKind = z.infer<typeof legalDocumentKindSchema>;

/**
 * The wizard's answers (docs/adr/0040). The use case has its own type for
 * them (`LegalDocumentAnswers` in `@kometio/application`): the API hands the
 * parsed body to it, so the compiler holds the two to each other and a field
 * added to one and not the other does not build.
 */
export const legalDocumentAnswersSchema = z.object({
  legalEntityName: z.string().min(1),
  contactEmail: z.string().email(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  vatId: z.string().nullable(),
  domain: z.string().nullable(),
  dataCollected: z.object({
    contactForm: z.boolean(),
    newsletter: z.boolean(),
    accounts: z.boolean(),
  }),
  // Vendor labels, e.g. "Google Analytics" — free text, not validated
  // against the real tracker list (the wizard pre-fills this, but the
  // admin can edit it freely before generating).
  thirdPartyServices: z.array(z.string().min(1)).max(MAX_THIRD_PARTY_SERVICES),
  retentionDays: z.number().int().positive().nullable(),
  // The code: each document names the country in its own language.
  jurisdictionCountry: isoCountryCodeSchema,
});
export type LegalDocumentAnswersBody = z.infer<
  typeof legalDocumentAnswersSchema
>;

export const generateLegalDocumentsBodySchema = z.object({
  documents: z.array(legalDocumentKindSchema).min(1),
  locales: z.array(z.string().min(2)).min(1),
  answers: legalDocumentAnswersSchema,
});
export type GenerateLegalDocumentsBody = z.infer<
  typeof generateLegalDocumentsBodySchema
>;

const generatedLegalDocumentTranslationSchema = z.object({
  locale: z.string(),
  translationId: z.string(),
  slug: z.string(),
});

export const generatedLegalDocumentSchema = z.object({
  kind: legalDocumentKindSchema,
  pageGroupId: z.string(),
  translations: z.array(generatedLegalDocumentTranslationSchema),
});
export type GeneratedLegalDocument = z.infer<
  typeof generatedLegalDocumentSchema
>;
export type GeneratedLegalDocumentTranslation =
  GeneratedLegalDocument['translations'][number];

export const generateLegalDocumentsResponseSchema = z.object({
  documents: z.array(generatedLegalDocumentSchema),
});
export type GenerateLegalDocumentsResponse = z.infer<
  typeof generateLegalDocumentsResponseSchema
>;

export const legalDocumentOutlineSchema = z.object({
  title: z.string(),
  sections: z.array(
    z.object({
      heading: z.string(),
      paragraphs: z.array(z.string()),
    }),
  ),
});
export type LegalDocumentOutline = z.infer<typeof legalDocumentOutlineSchema>;

export const previewLegalDocumentsResponseSchema = z.object({
  documents: z.array(
    z.object({
      kind: legalDocumentKindSchema,
      locales: z.record(z.string(), legalDocumentOutlineSchema),
    }),
  ),
});
export type PreviewLegalDocumentsResponse = z.infer<
  typeof previewLegalDocumentsResponseSchema
>;
