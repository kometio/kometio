import { z } from 'zod';
import type { IsoCountryCode } from '@kometio/shared-types';
import { request } from './http-client';

// Mirrors apps/api/.../legal-documents.schemas.ts's own wire contract — kept
// as a separate client-side shape rather than importing from `@kometio/application`
// (a backend-only layer), same convention as every other *-api-client.ts DTO
// in this app.
export const LEGAL_DOCUMENT_KINDS = [
  'privacy-policy',
  'cookie-policy',
  'terms-conditions',
] as const;
export type LegalDocumentKind = (typeof LEGAL_DOCUMENT_KINDS)[number];

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
  thirdPartyServices: string[];
  retentionDays: number | null;
  /** The country's ISO code: each document names it in its own language. */
  jurisdictionCountry: IsoCountryCode;
}

export interface GenerateLegalDocumentsInput {
  documents: LegalDocumentKind[];
  locales: string[];
  answers: LegalDocumentAnswers;
}

const generatedLegalDocumentSchema = z.object({
  kind: z.enum(LEGAL_DOCUMENT_KINDS),
  pageGroupId: z.string(),
  translations: z.array(
    z.object({
      locale: z.string(),
      translationId: z.string(),
      slug: z.string(),
    }),
  ),
});

const generateLegalDocumentsResponseSchema = z.object({
  documents: z.array(generatedLegalDocumentSchema),
});

const legalDocumentPreviewOutlineSchema = z.object({
  title: z.string(),
  sections: z.array(
    z.object({ heading: z.string(), paragraphs: z.array(z.string()) }),
  ),
});

const previewLegalDocumentsResponseSchema = z.object({
  documents: z.array(
    z.object({
      kind: z.enum(LEGAL_DOCUMENT_KINDS),
      locales: z.record(z.string(), legalDocumentPreviewOutlineSchema),
    }),
  ),
});

export type GeneratedLegalDocumentTranslation = z.infer<
  typeof generatedLegalDocumentSchema
>['translations'][number];
export type GeneratedLegalDocument = z.infer<
  typeof generatedLegalDocumentSchema
>;
export type GenerateLegalDocumentsResponse = z.infer<
  typeof generateLegalDocumentsResponseSchema
>;
export type LegalDocumentPreviewOutline = z.infer<
  typeof legalDocumentPreviewOutlineSchema
>;
export type PreviewLegalDocumentsResponse = z.infer<
  typeof previewLegalDocumentsResponseSchema
>;

export async function generateLegalDocuments(
  siteId: string,
  input: GenerateLegalDocumentsInput,
): Promise<GenerateLegalDocumentsResponse> {
  return generateLegalDocumentsResponseSchema.parse(
    await request(`/sites/${siteId}/legal-documents`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

export async function previewLegalDocuments(
  siteId: string,
  input: GenerateLegalDocumentsInput,
): Promise<PreviewLegalDocumentsResponse> {
  return previewLegalDocumentsResponseSchema.parse(
    await request(`/sites/${siteId}/legal-documents/preview`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}
