import {
  LEGAL_DOCUMENT_KINDS,
  generateLegalDocumentsResponseSchema,
  previewLegalDocumentsResponseSchema,
  type GenerateLegalDocumentsBody,
  type GenerateLegalDocumentsResponse,
  type GeneratedLegalDocument,
  type GeneratedLegalDocumentTranslation,
  type LegalDocumentAnswersBody,
  type LegalDocumentKind,
  type LegalDocumentOutline,
  type PreviewLegalDocumentsResponse,
} from '@kometio/api-contracts';
import { request } from './http-client';

// The wire shapes are `@kometio/api-contracts`'s (docs/adr/0111): the API
// validates a request with the schema this client's types come from, and
// this client checks the answer with the one the API builds it from.
export { LEGAL_DOCUMENT_KINDS };
export type {
  GenerateLegalDocumentsResponse,
  GeneratedLegalDocument,
  GeneratedLegalDocumentTranslation,
  LegalDocumentKind,
  PreviewLegalDocumentsResponse,
};
export type LegalDocumentAnswers = LegalDocumentAnswersBody;
export type GenerateLegalDocumentsInput = GenerateLegalDocumentsBody;
export type LegalDocumentPreviewOutline = LegalDocumentOutline;

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
