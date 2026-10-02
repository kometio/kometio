import { z } from 'zod';
import {
  isoCountryCodeSchema,
  MAX_THIRD_PARTY_SERVICES,
} from '@kometio/shared-types';

export const legalDocumentKindSchema = z.enum([
  'privacy-policy',
  'cookie-policy',
  'terms-conditions',
]);

// Mirrors LegalDocumentAnswers (libs/application/src/lib/legal-documents/legal-document-input.ts)
// — kept as a separate schema, not a `z.infer` re-export, same reasoning
// as every other body schema in this app: the wire contract is validated
// here, independently of how the use-case layer's own TS type evolves.
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

export const generateLegalDocumentsResponseSchema = z.object({
  documents: z.array(
    z.object({
      kind: legalDocumentKindSchema,
      pageGroupId: z.string(),
      translations: z.array(generatedLegalDocumentTranslationSchema),
    }),
  ),
});

const legalDocumentSectionSchema = z.object({
  heading: z.string(),
  paragraphs: z.array(z.string()),
});

export const previewLegalDocumentsResponseSchema = z.object({
  documents: z.array(
    z.object({
      kind: legalDocumentKindSchema,
      locales: z.record(
        z.string(),
        z.object({
          title: z.string(),
          sections: z.array(legalDocumentSectionSchema),
        }),
      ),
    }),
  ),
});
