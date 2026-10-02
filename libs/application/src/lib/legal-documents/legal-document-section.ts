import type { LegalDocumentAnswers } from './legal-document-input';

export interface LegalDocumentSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocumentOutline {
  title: string;
  sections: LegalDocumentSection[];
}

export type LegalDocumentLocale = 'it' | 'en';

// Falls back to the site's default locale's own generated text (never a
// raw locale code) when the wizard targets a locale this template set
// doesn't have — see generate-legal-documents.use-case.ts's caller.
export type LegalDocumentTemplate = Record<
  LegalDocumentLocale,
  (answers: LegalDocumentAnswers) => LegalDocumentOutline
>;
