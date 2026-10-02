import type { LegalDocumentAnswers } from './legal-document-input';
import { formatList, formatRetention } from './legal-document-formatting';
import type {
  LegalDocumentOutline,
  LegalDocumentTemplate,
} from './legal-document-section';

function collectedDataList(
  answers: LegalDocumentAnswers,
  locale: 'it' | 'en',
): string[] {
  const items: string[] = [];
  if (answers.dataCollected.contactForm) {
    items.push(
      locale === 'it'
        ? 'dati inseriti nei moduli di contatto'
        : 'data submitted through contact forms',
    );
  }
  if (answers.dataCollected.newsletter) {
    items.push(
      locale === 'it'
        ? 'indirizzo email per la newsletter'
        : 'email address for the newsletter',
    );
  }
  if (answers.dataCollected.accounts) {
    items.push(locale === 'it' ? 'dati account utente' : 'user account data');
  }
  items.push(
    locale === 'it'
      ? 'dati tecnici di navigazione (indirizzo IP, tipo di browser, pagine visitate)'
      : 'technical browsing data (IP address, browser type, pages visited)',
  );
  return items;
}

function buildIt(answers: LegalDocumentAnswers): LegalDocumentOutline {
  const collected = collectedDataList(answers, 'it');
  return {
    title: 'Informativa sulla Privacy',
    sections: [
      {
        heading: 'Titolare del trattamento',
        paragraphs: [
          `Il titolare del trattamento dei dati è ${answers.legalEntityName}` +
            (answers.address ? `, con sede in ${answers.address}` : '') +
            (answers.vatId ? ` (P.IVA ${answers.vatId})` : '') +
            `. Per qualsiasi richiesta relativa al trattamento dei tuoi dati personali puoi scrivere a ${answers.contactEmail}.`,
        ],
      },
      {
        heading: 'Dati raccolti',
        paragraphs: [
          `Nell'ambito dell'utilizzo di questo sito` +
            (answers.domain ? ` (${answers.domain})` : '') +
            ` raccogliamo le seguenti categorie di dati: ${formatList(collected, 'it')}.`,
        ],
      },
      {
        heading: 'Finalità e base giuridica del trattamento',
        paragraphs: [
          "I tuoi dati sono trattati per rispondere alle tue richieste, fornire i servizi richiesti (es. iscrizione alla newsletter, creazione di un account) e, previo tuo consenso, per finalità di misurazione statistica e miglioramento dell'esperienza sul sito. La base giuridica è, a seconda dei casi, l'esecuzione di un contratto, il consenso dell'interessato o il legittimo interesse del titolare.",
        ],
      },
      {
        heading: 'Comunicazione a terzi',
        paragraphs: [
          `I tuoi dati possono essere condivisi con i seguenti fornitori terzi, nella misura strettamente necessaria a fornire il servizio: ${formatList(answers.thirdPartyServices, 'it')}. Alcuni di questi trattamenti richiedono il tuo consenso esplicito tramite il banner cookie presente sul sito — vedi la nostra Cookie Policy.`,
        ],
      },
      {
        heading: 'Periodo di conservazione',
        paragraphs: [
          `I dati raccolti tramite i moduli di contatto sono conservati ${formatRetention(answers.retentionDays, 'it')}.`,
        ],
      },
      {
        heading: 'I tuoi diritti',
        paragraphs: [
          "In qualità di interessato hai diritto di accedere ai tuoi dati, richiederne la rettifica o la cancellazione, limitarne il trattamento, opporti al trattamento e richiederne la portabilità, oltre al diritto di proporre reclamo all'autorità di controllo competente. Per esercitare questi diritti scrivi a " +
            answers.contactEmail +
            '.',
        ],
      },
    ],
  };
}

function buildEn(answers: LegalDocumentAnswers): LegalDocumentOutline {
  const collected = collectedDataList(answers, 'en');
  return {
    title: 'Privacy Policy',
    sections: [
      {
        heading: 'Data controller',
        paragraphs: [
          `The data controller is ${answers.legalEntityName}` +
            (answers.address ? `, located at ${answers.address}` : '') +
            (answers.vatId ? ` (VAT ${answers.vatId})` : '') +
            `. For any request about the processing of your personal data, write to ${answers.contactEmail}.`,
        ],
      },
      {
        heading: 'Data we collect',
        paragraphs: [
          `Through your use of this site` +
            (answers.domain ? ` (${answers.domain})` : '') +
            ` we collect the following categories of data: ${formatList(collected, 'en')}.`,
        ],
      },
      {
        heading: 'Purposes and legal basis',
        paragraphs: [
          "Your data is processed to respond to your requests, provide the services you request (e.g. newsletter subscription, account creation) and, with your consent, for statistical measurement and to improve your experience on the site. The legal basis is, depending on the case, contract performance, your consent, or the controller's legitimate interest.",
        ],
      },
      {
        heading: 'Sharing with third parties',
        paragraphs: [
          `Your data may be shared with the following third-party providers, only to the extent strictly necessary to deliver the service: ${formatList(answers.thirdPartyServices, 'en')}. Some of this processing requires your explicit consent via the site's cookie banner — see our Cookie Policy.`,
        ],
      },
      {
        heading: 'Retention period',
        paragraphs: [
          `Data collected through contact forms is retained ${formatRetention(answers.retentionDays, 'en')}.`,
        ],
      },
      {
        heading: 'Your rights',
        paragraphs: [
          'As a data subject you have the right to access your data, request its correction or deletion, restrict its processing, object to processing, request data portability, and lodge a complaint with the competent supervisory authority. To exercise these rights, write to ' +
            answers.contactEmail +
            '.',
        ],
      },
    ],
  };
}

export const privacyPolicyTemplate: LegalDocumentTemplate = {
  it: buildIt,
  en: buildEn,
};
