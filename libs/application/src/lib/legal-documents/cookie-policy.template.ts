import type { LegalDocumentAnswers } from './legal-document-input';
import { formatList } from './legal-document-formatting';
import type {
  LegalDocumentOutline,
  LegalDocumentTemplate,
} from './legal-document-section';

function buildIt(answers: LegalDocumentAnswers): LegalDocumentOutline {
  return {
    title: 'Cookie Policy',
    sections: [
      {
        heading: 'Cosa sono i cookie',
        paragraphs: [
          'I cookie sono piccoli file di testo che i siti visitati inviano al tuo dispositivo, dove vengono memorizzati per essere poi ritrasmessi agli stessi siti alla visita successiva. Li usiamo, insieme a tecnologie simili, per far funzionare il sito e, con il tuo consenso, per misurare il traffico e personalizzare la tua esperienza.',
        ],
      },
      {
        heading: 'Le categorie che usiamo',
        paragraphs: [
          'Necessari: indispensabili al funzionamento del sito, sempre attivi, non richiedono consenso.',
          "Funzionalità: ricordano le tue scelte (es. lingua, preferenze) per offrirti un'esperienza migliore.",
          'Misurazione: ci aiutano a capire come i visitatori usano il sito, in forma aggregata.',
          'Esperienza: personalizzano i contenuti mostrati da questo sito e dai suoi partner.',
        ],
      },
      {
        heading: 'Cookie di terze parti',
        paragraphs: [
          `Il sito può utilizzare i seguenti servizi di terze parti, ciascuno soggetto alla propria informativa privacy: ${formatList(answers.thirdPartyServices, 'it')}.`,
        ],
      },
      {
        heading: 'Come gestire le tue preferenze',
        paragraphs: [
          "Puoi scegliere quali categorie di cookie accettare dal banner mostrato alla tua prima visita, e modificare la tua scelta in qualsiasi momento tramite l'icona di gestione dei cookie presente sul sito.",
        ],
      },
      {
        heading: 'Contatti',
        paragraphs: [
          `Per qualsiasi domanda su questa Cookie Policy scrivi a ${answers.contactEmail}.`,
        ],
      },
    ],
  };
}

function buildEn(answers: LegalDocumentAnswers): LegalDocumentOutline {
  return {
    title: 'Cookie Policy',
    sections: [
      {
        heading: 'What cookies are',
        paragraphs: [
          "Cookies are small text files that the sites you visit send to your device, where they're stored and sent back to those same sites on your next visit. We use them, along with similar technologies, to run the site and, with your consent, to measure traffic and personalize your experience.",
        ],
      },
      {
        heading: 'The categories we use',
        paragraphs: [
          "Necessary: required for the site to work, always active, don't require consent.",
          'Functionality: remember your choices (e.g. language, preferences) to provide a better experience.',
          'Measurement: help us understand how visitors use the site, in aggregate form.',
          'Experience: personalize the content shown by this site and its partners.',
        ],
      },
      {
        heading: 'Third-party cookies',
        paragraphs: [
          `The site may use the following third-party services, each subject to its own privacy policy: ${formatList(answers.thirdPartyServices, 'en')}.`,
        ],
      },
      {
        heading: 'Managing your preferences',
        paragraphs: [
          'You can choose which cookie categories to accept from the banner shown on your first visit, and change your choice at any time via the cookie-preferences icon present on the site.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: [
          `For any question about this Cookie Policy, write to ${answers.contactEmail}.`,
        ],
      },
    ],
  };
}

export const cookiePolicyTemplate: LegalDocumentTemplate = {
  it: buildIt,
  en: buildEn,
};
