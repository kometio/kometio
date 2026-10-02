import { getCountryDisplayName } from '@kometio/shared-types';
import type { LegalDocumentAnswers } from './legal-document-input';
import type {
  LegalDocumentOutline,
  LegalDocumentTemplate,
} from './legal-document-section';

function buildIt(answers: LegalDocumentAnswers): LegalDocumentOutline {
  const country = getCountryDisplayName(answers.jurisdictionCountry, 'it');
  return {
    title: 'Termini e Condizioni',
    sections: [
      {
        heading: 'Accettazione dei termini',
        paragraphs: [
          `Accedendo e utilizzando questo sito` +
            (answers.domain ? ` (${answers.domain})` : '') +
            `, gestito da ${answers.legalEntityName}, accetti integralmente i presenti Termini e Condizioni. Se non li accetti, ti invitiamo a non utilizzare il sito.`,
        ],
      },
      {
        heading: 'Utilizzo del sito',
        paragraphs: [
          'Ti impegni a utilizzare il sito in modo lecito e conforme alla legge applicabile, senza violare i diritti di terzi né compromettere il funzionamento del sito stesso.',
        ],
      },
      {
        heading: 'Proprietà intellettuale',
        paragraphs: [
          `Tutti i contenuti presenti sul sito (testi, immagini, loghi, marchi) sono di proprietà di ${answers.legalEntityName} o dei rispettivi licenzianti e sono protetti dalle normative applicabili in materia di proprietà intellettuale. Non è consentita la riproduzione senza autorizzazione scritta.`,
        ],
      },
      {
        heading: 'Limitazione di responsabilità',
        paragraphs: [
          `${answers.legalEntityName} non garantisce che il sito sia sempre disponibile, privo di errori o interruzioni, e non risponde di eventuali danni derivanti dall'utilizzo del sito, nei limiti consentiti dalla legge applicabile.`,
        ],
      },
      {
        heading: 'Legge applicabile e foro competente',
        paragraphs: [
          // "del seguente Paese: X" and not "di X": the preposition a country
          // takes depends on it ("dell'Italia", "degli Stati Uniti", "dei
          // Paesi Bassi"), and a template cannot know which.
          `I presenti Termini sono regolati dalla legge del seguente Paese: ${country}. Per qualsiasi controversia relativa al presente sito sarà competente il foro individuato secondo le norme di legge applicabili in tale Paese.`,
        ],
      },
      {
        heading: 'Modifiche ai termini',
        paragraphs: [
          'Ci riserviamo il diritto di modificare i presenti Termini in qualsiasi momento; le modifiche saranno pubblicate su questa pagina con indicazione della data di ultimo aggiornamento.',
        ],
      },
      {
        heading: 'Contatti',
        paragraphs: [
          `Per qualsiasi domanda su questi Termini e Condizioni scrivi a ${answers.contactEmail}.`,
        ],
      },
    ],
  };
}

function buildEn(answers: LegalDocumentAnswers): LegalDocumentOutline {
  const country = getCountryDisplayName(answers.jurisdictionCountry, 'en');
  return {
    title: 'Terms & Conditions',
    sections: [
      {
        heading: 'Acceptance of terms',
        paragraphs: [
          `By accessing and using this site` +
            (answers.domain ? ` (${answers.domain})` : '') +
            `, operated by ${answers.legalEntityName}, you fully accept these Terms & Conditions. If you do not accept them, please do not use the site.`,
        ],
      },
      {
        heading: 'Use of the site',
        paragraphs: [
          "You agree to use the site lawfully and in compliance with applicable law, without infringing the rights of others or compromising the site's own operation.",
        ],
      },
      {
        heading: 'Intellectual property',
        paragraphs: [
          `All content on the site (text, images, logos, trademarks) is the property of ${answers.legalEntityName} or its licensors and is protected by applicable intellectual property law. Reproduction without written authorization is not permitted.`,
        ],
      },
      {
        heading: 'Limitation of liability',
        paragraphs: [
          `${answers.legalEntityName} does not guarantee that the site will always be available, error-free, or uninterrupted, and is not liable for any damages arising from use of the site, to the extent permitted by applicable law.`,
        ],
      },
      {
        heading: 'Governing law and jurisdiction',
        paragraphs: [
          // The same in English: "the United States", "the Netherlands".
          `These Terms are governed by the law of the following country: ${country}. Any dispute relating to this site will be subject to the jurisdiction determined under the laws applicable in that country.`,
        ],
      },
      {
        heading: 'Changes to these terms',
        paragraphs: [
          'We reserve the right to modify these Terms at any time; changes will be published on this page along with the date of the last update.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: [
          `For any question about these Terms & Conditions, write to ${answers.contactEmail}.`,
        ],
      },
    ],
  };
}

export const termsConditionsTemplate: LegalDocumentTemplate = {
  it: buildIt,
  en: buildEn,
};
