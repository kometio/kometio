import {
  banner,
  button,
  callout,
  contactFields,
  faq,
  featureGrid,
  footer,
  form,
  header,
  heading,
  hero,
  list,
  steps,
  text,
  toPage,
} from './starter-blocks';
import type { Starter, StarterContent, StarterContext } from './starter';

/**
 * A studio or a small business that sells its time: what it does, how it
 * works, who it is, and a way to write. Four pages, one form. Nothing here
 * claims a number, a client or a year: a site that went out with a made-up
 * figure on it would be the owner's, not the starter's.
 */

function italian({ siteName }: StarterContext): StarterContent {
  const home = toPage('home', siteName);
  const pages = [
    { label: 'Servizi', to: toPage('servizi', 'Servizi') },
    { label: 'Chi siamo', to: toPage('chi-siamo', 'Chi siamo') },
    { label: 'Contatti', to: toPage('contatti', 'Contatti') },
  ];
  const contact = toPage('contatti', 'Contatti');

  return {
    header: header(siteName, home, pages),
    footer: footer(`${siteName}. Tutti i diritti riservati.`, pages),
    forms: [
      {
        key: 'contatti',
        name: 'Contatti',
        fields: contactFields({
          name: 'Nome',
          email: 'Email',
          message: 'Come possiamo aiutarti?',
        }),
      },
    ],
    collections: [],
    taxonomies: [],
    pages: [
      {
        key: 'home',
        slug: 'home',
        title: siteName,
        description:
          'Consulenza e progetti su misura: ascoltiamo, proponiamo una strada chiara e la percorriamo insieme.',
        content: [
          hero(
            {
              eyebrow: 'Consulenza e progetti su misura',
              title: 'Un metodo semplice per far funzionare il tuo lavoro',
              subtitle:
                'Ascoltiamo, proponiamo una strada chiara e la percorriamo insieme. Senza giri di parole.',
            },
            [
              button('Parliamo del tuo progetto', contact),
              button('Cosa facciamo', toPage('servizi', 'Servizi'), 'outline'),
            ],
          ),
          heading('Cosa facciamo'),
          featureGrid([
            {
              icon: 'compass',
              title: 'Consulenza',
              text: 'Capiamo da dove parti e dove vuoi arrivare, poi mettiamo in fila le priorità.',
            },
            {
              icon: 'pencil-ruler',
              title: 'Progetto',
              text: 'Dal piano al lavoro finito: tempi, passi e responsabilità sono chiari prima di cominciare.',
            },
            {
              icon: 'life-buoy',
              title: 'Assistenza',
              text: 'Restiamo accanto a te anche dopo la consegna, per le modifiche e per le domande.',
            },
          ]),
          heading('Come lavoriamo'),
          steps([
            {
              title: 'Ci conosciamo',
              description:
                'Una prima chiacchierata per capire di cosa hai bisogno.',
            },
            {
              title: 'Definiamo il piano',
              description:
                'Ti proponiamo cosa fare, in che ordine e a che condizioni.',
            },
            {
              title: 'Lo realizziamo',
              description:
                'Lavoriamo insieme, con aggiornamenti chiari a ogni passo.',
            },
          ]),
          heading('Domande frequenti'),
          faq([
            {
              question: 'Quanto dura un progetto?',
              answer:
                'Dipende da cosa serve. Dopo la prima chiacchierata ti diciamo tempi e passi, prima che tu decida.',
            },
            {
              question: 'Come si comincia?',
              answer:
                'Scrivici dal modulo dei contatti: ti rispondiamo e fissiamo un primo incontro.',
            },
            {
              question: 'Posso chiedere solo una parte del lavoro?',
              answer:
                'Certo. Si può partire da una consulenza e decidere dopo se andare avanti.',
            },
          ]),
          banner({
            title: 'Hai un progetto in mente?',
            text: 'Raccontacelo in poche righe: da lì si parte.',
            buttonLabel: 'Scrivici',
            to: contact,
          }),
        ],
      },
      {
        key: 'servizi',
        slug: 'servizi',
        title: 'Servizi',
        description:
          'Tre modi di lavorare insieme: consulenza, progetto e assistenza.',
        content: [
          hero({
            eyebrow: 'Servizi',
            title: 'Cosa possiamo fare per te',
            subtitle:
              'Tre modi di lavorare insieme, da scegliere o da combinare.',
          }),
          heading('Consulenza'),
          text(
            'Un percorso breve per mettere ordine: gli obiettivi, le priorità, i prossimi passi.',
          ),
          list([
            'Un incontro iniziale per ascoltarti',
            'Un documento con le priorità e il piano',
            'Una verifica dopo qualche settimana',
          ]),
          heading('Progetto'),
          text(
            'Ci occupiamo del lavoro dall’inizio alla fine, con un referente che conosci e tappe che puoi seguire.',
          ),
          list([
            'Un piano con tempi e costi chiari',
            'Aggiornamenti a ogni tappa',
            'Una consegna completa, con tutto spiegato',
          ]),
          heading('Assistenza'),
          text(
            'Dopo la consegna le cose continuano a cambiare. Ci siamo per le modifiche e per le domande.',
          ),
          list([
            'Un riferimento a cui scrivere',
            'Modifiche e aggiornamenti periodici',
            'Un controllo regolare che tutto funzioni',
          ]),
          button('Scrivici', contact),
        ],
      },
      {
        key: 'chi-siamo',
        slug: 'chi-siamo',
        title: 'Chi siamo',
        description: 'Chi siamo e come lavoriamo.',
        content: [
          hero({
            eyebrow: 'Chi siamo',
            title: 'Persone, non un reparto',
            subtitle:
              'Lavoriamo con poche persone alla volta, così possiamo conoscerle davvero.',
          }),
          text(
            `${siteName} è un piccolo studio. Preferiamo seguire pochi progetti e farli bene, parlando con chi li commissiona e non con un intermediario.`,
          ),
          callout(
            'Testo di esempio: racconta chi siete, da quanto lavorate insieme e che cosa vi sta a cuore.',
          ),
          heading('Come la pensiamo'),
          featureGrid([
            {
              title: 'Parliamo chiaro',
              text: 'Dici cosa ti serve, ti diciamo cosa possiamo fare e cosa no.',
            },
            {
              title: 'Facciamo ciò che diciamo',
              text: 'Tempi e costi si concordano prima, e si rispettano.',
            },
            {
              title: 'Lasciamo tutto in ordine',
              text: 'A fine lavoro hai in mano ciò che serve per andare avanti anche senza di noi.',
            },
          ]),
        ],
      },
      {
        key: 'contatti',
        slug: 'contatti',
        title: 'Contatti',
        description: 'Scrivici: ti rispondiamo noi.',
        content: [
          hero({
            eyebrow: 'Contatti',
            title: 'Scrivici',
            subtitle:
              'Raccontaci in poche righe di cosa hai bisogno: ti rispondiamo noi.',
          }),
          form('contatti', 'Contatti'),
        ],
      },
    ],
  };
}

function english({ siteName }: StarterContext): StarterContent {
  const home = toPage('home', siteName);
  const pages = [
    { label: 'Services', to: toPage('servizi', 'Services') },
    { label: 'About', to: toPage('chi-siamo', 'About') },
    { label: 'Contact', to: toPage('contatti', 'Contact') },
  ];
  const contact = toPage('contatti', 'Contact');

  return {
    header: header(siteName, home, pages),
    footer: footer(`${siteName}. All rights reserved.`, pages),
    forms: [
      {
        key: 'contatti',
        name: 'Contact',
        fields: contactFields({
          name: 'Name',
          email: 'Email',
          message: 'How can we help?',
        }),
      },
    ],
    collections: [],
    taxonomies: [],
    pages: [
      {
        key: 'home',
        slug: 'home',
        title: siteName,
        description:
          'Consulting and projects built around you: we listen, suggest a clear way forward and walk it with you.',
        content: [
          hero(
            {
              eyebrow: 'Consulting and projects built around you',
              title: 'A simple way to make your work work',
              subtitle:
                'We listen, suggest a clear way forward and walk it with you. No jargon.',
            },
            [
              button('Tell us about your project', contact),
              button('What we do', toPage('servizi', 'Services'), 'outline'),
            ],
          ),
          heading('What we do'),
          featureGrid([
            {
              icon: 'compass',
              title: 'Advice',
              text: 'We work out where you are and where you want to be, then put the priorities in order.',
            },
            {
              icon: 'pencil-ruler',
              title: 'Projects',
              text: 'From plan to finished work: timing, steps and who does what are clear before we start.',
            },
            {
              icon: 'life-buoy',
              title: 'Support',
              text: 'We stay close after delivery, for changes and for questions.',
            },
          ]),
          heading('How we work'),
          steps([
            {
              title: 'We get to know you',
              description: 'A first conversation to understand what you need.',
            },
            {
              title: 'We agree a plan',
              description:
                'We suggest what to do, in what order and on what terms.',
            },
            {
              title: 'We make it happen',
              description:
                'We work with you, with clear updates at every step.',
            },
          ]),
          heading('Questions people ask'),
          faq([
            {
              question: 'How long does a project take?',
              answer:
                'It depends on what you need. After a first conversation we tell you the timing and the steps, before you decide anything.',
            },
            {
              question: 'How do we start?',
              answer:
                'Write to us from the contact form: we reply and set up a first meeting.',
            },
            {
              question: 'Can I ask for just part of the work?',
              answer:
                'Of course. You can start with some advice and decide later whether to go further.',
            },
          ]),
          banner({
            title: 'Have a project in mind?',
            text: 'Tell us about it in a few lines: that is where we begin.',
            buttonLabel: 'Write to us',
            to: contact,
          }),
        ],
      },
      {
        key: 'servizi',
        slug: 'services',
        title: 'Services',
        description:
          'Three ways of working together: advice, projects and support.',
        content: [
          hero({
            eyebrow: 'Services',
            title: 'What we can do for you',
            subtitle:
              'Three ways of working together, to choose from or to combine.',
          }),
          heading('Advice'),
          text(
            'A short engagement to put things in order: goals, priorities, next steps.',
          ),
          list([
            'A first meeting to listen to you',
            'A document with the priorities and the plan',
            'A check-in a few weeks later',
          ]),
          heading('Projects'),
          text(
            'We take care of the work from start to finish, with one person you know and milestones you can follow.',
          ),
          list([
            'A plan with clear timing and costs',
            'An update at every milestone',
            'A complete handover, with everything explained',
          ]),
          heading('Support'),
          text(
            'Things keep changing after delivery. We are here for the changes and the questions.',
          ),
          list([
            'Someone to write to',
            'Regular changes and updates',
            'A routine check that everything still works',
          ]),
          button('Write to us', contact),
        ],
      },
      {
        key: 'chi-siamo',
        slug: 'about',
        title: 'About',
        description: 'Who we are and how we work.',
        content: [
          hero({
            eyebrow: 'About',
            title: 'People, not a department',
            subtitle:
              'We work with a few clients at a time, so we can really get to know them.',
          }),
          text(
            `${siteName} is a small studio. We would rather take on fewer projects and do them well, talking to the person who asked for them and not to a go-between.`,
          ),
          callout(
            'Sample text: tell people who you are, how long you have worked together and what you care about.',
          ),
          heading('How we see it'),
          featureGrid([
            {
              title: 'We speak plainly',
              text: 'You tell us what you need, we tell you what we can and cannot do.',
            },
            {
              title: 'We do what we say',
              text: 'Timing and costs are agreed first, and kept.',
            },
            {
              title: 'We leave things tidy',
              text: 'At the end you have what you need to carry on without us.',
            },
          ]),
        ],
      },
      {
        key: 'contatti',
        slug: 'contact',
        title: 'Contact',
        description: 'Write to us: we will reply ourselves.',
        content: [
          hero({
            eyebrow: 'Contact',
            title: 'Write to us',
            subtitle:
              'Tell us in a few lines what you need: we will reply ourselves.',
          }),
          form('contatti', 'Contact'),
        ],
      },
    ],
  };
}

export const studioStarter: Starter = {
  id: 'studio',
  themeName: 'classic',
  content: { it: italian, en: english },
};
