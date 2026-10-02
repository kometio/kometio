import type { LegalDocumentLocale } from './legal-document-section';

// The disclaimer baked into the first block of every generated page
// (docs/adr/0040, decision #1 of the earlier cookie-banner session: a
// clear starting template, never a compliance guarantee).
export const DRAFT_NOTICE_TEXT: Record<LegalDocumentLocale, string> = {
  it: 'Questa pagina è una bozza generata automaticamente da un modello — fai revisionare il testo da un legale prima di pubblicarla. Puoi eliminare questo avviso una volta completata la revisione.',
  en: 'This page is a draft automatically generated from a template — have a lawyer review the text before publishing it. You can delete this notice once the review is complete.',
};

/** "A, B and C" / "A, B e C" — no Intl.ListFormat dependency on locales this narrow (it/en only, v1). */
export function formatList(
  items: string[],
  locale: LegalDocumentLocale,
): string {
  const last = items.at(-1);
  if (last === undefined) {
    return locale === 'it' ? 'nessuno' : 'none';
  }
  if (items.length === 1) {
    return last;
  }
  const and = locale === 'it' ? 'e' : 'and';
  return `${items.slice(0, -1).join(', ')} ${and} ${last}`;
}

export function formatRetention(
  days: number | null,
  locale: LegalDocumentLocale,
): string {
  if (days === null) {
    return locale === 'it'
      ? 'per il tempo necessario alle finalità descritte, senza un termine massimo prestabilito'
      : 'for as long as necessary for the purposes described, with no predetermined maximum term';
  }
  return locale === 'it'
    ? `per un massimo di ${days} giorni`
    : `for up to ${days} days`;
}
