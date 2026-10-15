import {
  button,
  callout,
  contactFields,
  footer,
  form,
  header,
  heading,
  hero,
  list,
  subPages,
  text,
  toPage,
} from './starter-blocks';
import type {
  Starter,
  StarterContent,
  StarterContext,
  StarterPage,
} from './starter';

/**
 * Somebody who shows work: a home that points at the latest, a page that
 * holds them all, three projects of the kind a person writes up, a page about
 * them and a way to write. The projects are made up and say so: a portfolio
 * that went out with somebody else's work on it, or with none, is worse than
 * one that says "replace this".
 *
 * It has no pictures. A starter that shipped photographs would ship their
 * licence too, and a portfolio without any is plain but is not wrong.
 */

interface Project {
  key: string;
  slug: string;
  title: string;
  summary: string;
  start: string;
  did: string[];
  result: string;
}

interface Words {
  home: { title: string; slug: string; description: string };
  projects: { title: string; slug: string; description: string };
  about: { title: string; slug: string; description: string };
  contact: { title: string; slug: string; description: string };
  hero: { eyebrow: string; title: string; subtitle: string };
  seeProjects: string;
  writeToMe: string;
  latest: string;
  allProjects: string;
  projectEyebrow: string;
  exampleNote: string;
  startHeading: string;
  didHeading: string;
  resultHeading: string;
  projectsIntro: { eyebrow: string; title: string; subtitle: string };
  aboutHero: { eyebrow: string; title: string; subtitle: string };
  aboutText: string;
  aboutNote: string;
  howIWork: string;
  howIWorkItems: string[];
  contactHero: { eyebrow: string; title: string; subtitle: string };
  contactFormName: string;
  fieldLabels: { name: string; email: string; message: string };
  footerLine: (siteName: string) => string;
  projectsList: Project[];
}

function build({ siteName }: StarterContext, words: Words): StarterContent {
  const home = toPage('home', siteName);
  const projects = toPage('progetti', words.projects.title);
  const contact = toPage('contatti', words.contact.title);
  const menu = [
    { label: words.projects.title, to: projects },
    { label: words.about.title, to: toPage('chi-sono', words.about.title) },
    { label: words.contact.title, to: contact },
  ];

  const projectPages: StarterPage[] = words.projectsList.map((project) => ({
    key: project.key,
    parent: 'progetti',
    slug: project.slug,
    title: project.title,
    description: project.summary,
    content: [
      hero({
        eyebrow: words.projectEyebrow,
        title: project.title,
        subtitle: project.summary,
      }),
      callout(words.exampleNote),
      heading(words.startHeading),
      text(project.start),
      heading(words.didHeading),
      list(project.did),
      heading(words.resultHeading),
      text(project.result),
      button(words.allProjects, projects, 'outline'),
    ],
  }));

  return {
    header: header(siteName, home, menu),
    footer: footer(words.footerLine(siteName), menu),
    forms: [
      {
        key: 'contatti',
        name: words.contactFormName,
        fields: contactFields(words.fieldLabels),
      },
    ],
    collections: [],
    taxonomies: [],
    pages: [
      {
        key: 'home',
        slug: 'home',
        title: siteName,
        description: words.home.description,
        content: [
          hero(words.hero, [
            button(words.seeProjects, projects),
            button(words.writeToMe, contact, 'outline'),
          ]),
          heading(words.latest),
          subPages(
            { key: 'progetti', title: words.projects.title },
            'cards',
            3,
          ),
        ],
      },
      {
        key: 'progetti',
        slug: words.projects.slug,
        title: words.projects.title,
        description: words.projects.description,
        content: [
          hero(words.projectsIntro),
          subPages({ key: 'progetti', title: words.projects.title }, 'cards'),
        ],
      },
      ...projectPages,
      {
        key: 'chi-sono',
        slug: words.about.slug,
        title: words.about.title,
        description: words.about.description,
        content: [
          hero(words.aboutHero),
          text(words.aboutText),
          callout(words.aboutNote),
          heading(words.howIWork),
          list(words.howIWorkItems),
        ],
      },
      {
        key: 'contatti',
        slug: words.contact.slug,
        title: words.contact.title,
        description: words.contact.description,
        content: [
          hero(words.contactHero),
          form('contatti', words.contactFormName),
        ],
      },
    ],
  };
}

const italianWords: Words = {
  home: {
    title: 'Home',
    slug: 'home',
    description:
      'Una selezione di progetti recenti e del modo in cui sono stati affrontati.',
  },
  projects: {
    title: 'Progetti',
    slug: 'progetti',
    description: 'Tutti i progetti, dal più recente.',
  },
  about: {
    title: 'Chi sono',
    slug: 'chi-sono',
    description: 'Cosa faccio, come lavoro e con chi mi piace lavorare.',
  },
  contact: {
    title: 'Contatti',
    slug: 'contatti',
    description: 'Scrivimi: rispondo io.',
  },
  hero: {
    eyebrow: 'Portfolio',
    title: 'Lavori scelti, raccontati con calma',
    subtitle:
      'Una selezione dei miei progetti recenti e del modo in cui li ho affrontati.',
  },
  seeProjects: 'Vedi i progetti',
  writeToMe: 'Scrivimi',
  latest: 'Ultimi progetti',
  allProjects: 'Tutti i progetti',
  projectEyebrow: 'Progetto',
  exampleNote:
    'Progetto di esempio: sostituiscilo con uno dei tuoi, o eliminalo.',
  startHeading: 'Il punto di partenza',
  didHeading: 'Cosa ho fatto',
  resultHeading: 'Il risultato',
  projectsIntro: {
    eyebrow: 'Progetti',
    title: 'Tutti i lavori',
    subtitle: 'Ognuno con il suo punto di partenza e quello che ne è venuto.',
  },
  aboutHero: {
    eyebrow: 'Chi sono',
    title: 'Un po’ di me',
    subtitle: 'Quello che faccio, come lo faccio e con chi mi piace lavorare.',
  },
  aboutText:
    'Mi occupo di progetti digitali e di comunicazione. Prima di mettere mano alla soluzione cerco di capire bene il problema, e di capirlo con le persone che lo vivono.',
  aboutNote:
    'Testo di esempio: racconta chi sei, da dove vieni e che cosa ti piace fare.',
  howIWork: 'Come lavoro',
  howIWorkItems: [
    'Comincio ascoltando, prima di proporre',
    'Mostro il lavoro mentre cresce, non solo alla fine',
    'Lascio tutto documentato, così si può proseguire senza di me',
  ],
  contactHero: {
    eyebrow: 'Contatti',
    title: 'Scrivimi',
    subtitle: 'Raccontami in poche righe cosa hai in mente: rispondo io.',
  },
  contactFormName: 'Contatti',
  fieldLabels: { name: 'Nome', email: 'Email', message: 'Messaggio' },
  footerLine: (siteName) => `${siteName}. Tutti i diritti riservati.`,
  projectsList: [
    {
      key: 'libreria',
      slug: 'sito-per-una-libreria',
      title: 'Un sito per una libreria di quartiere',
      summary:
        'Un sito semplice per una libreria: i libri scelti, gli incontri, un modo per scrivere.',
      start:
        'La libreria aveva una clientela fedele e nessuna presenza online. Voleva farsi trovare senza trasformarsi in un negozio digitale.',
      did: [
        'Ho raccolto le domande che i clienti fanno più spesso',
        'Ho disegnato un sito di poche pagine, facile da aggiornare da sola',
        'Ho preparato un calendario degli incontri con gli autori',
      ],
      result:
        'Oggi chi cerca la libreria trova gli orari, gli incontri del mese e un modulo per scrivere. L’aggiornamento richiede pochi minuti.',
    },
    {
      key: 'caffe',
      slug: 'identita-per-un-caffe',
      title: 'Identità visiva per un caffè',
      summary:
        'Un marchio, i colori e le regole per usarli, dalla vetrina al bicchiere.',
      start:
        'Un nuovo caffè cercava un’identità riconoscibile, che reggesse sia sull’insegna sia su un adesivo di cinque centimetri.',
      did: [
        'Ho studiato il quartiere e i locali intorno',
        'Ho proposto tre direzioni e ne abbiamo scelta una insieme',
        'Ho scritto una pagina di regole semplici per usare marchio e colori',
      ],
      result:
        'Il caffè ha un’immagine coerente su insegna, menù e social, e chi lavora lì sa come usarla senza chiedere ogni volta.',
    },
    {
      key: 'prenotazioni',
      slug: 'app-per-prenotare',
      title: 'Un’app per prenotare i campi sportivi',
      summary:
        'Prenotare un campo in tre tocchi, e per chi li gestisce un calendario che si legge a colpo d’occhio.',
      start:
        'Il centro sportivo gestiva le prenotazioni per telefono e su un foglio. Capitavano doppioni, e il lunedì mattina era un caos.',
      did: [
        'Ho osservato come funzionava la reception per una settimana',
        'Ho disegnato il percorso di prenotazione fino ai tre passaggi essenziali',
        'Ho provato la versione di prova con alcuni abituali',
      ],
      result:
        'Le prenotazioni arrivano già ordinate e senza doppioni. La reception risponde al telefono solo per le eccezioni.',
    },
  ],
};

const englishWords: Words = {
  home: {
    title: 'Home',
    slug: 'home',
    description: 'A selection of recent projects and how they were approached.',
  },
  projects: {
    title: 'Projects',
    slug: 'projects',
    description: 'All the projects, most recent first.',
  },
  about: {
    title: 'About me',
    slug: 'about-me',
    description: 'What I do, how I work and who I like to work with.',
  },
  contact: {
    title: 'Contact',
    slug: 'contact',
    description: 'Write to me: I reply myself.',
  },
  hero: {
    eyebrow: 'Portfolio',
    title: 'Selected work, told without rushing',
    subtitle:
      'A selection of my recent projects and the way I went about them.',
  },
  seeProjects: 'See the projects',
  writeToMe: 'Write to me',
  latest: 'Latest projects',
  allProjects: 'All projects',
  projectEyebrow: 'Project',
  exampleNote: 'Sample project: replace it with one of your own, or delete it.',
  startHeading: 'Where it started',
  didHeading: 'What I did',
  resultHeading: 'The result',
  projectsIntro: {
    eyebrow: 'Projects',
    title: 'All the work',
    subtitle: 'Each with where it started and what came of it.',
  },
  aboutHero: {
    eyebrow: 'About me',
    title: 'A little about me',
    subtitle: 'What I do, how I do it and who I like to work with.',
  },
  aboutText:
    'I work on digital projects and communication. Before I touch a solution I try to understand the problem properly, and to understand it with the people who live with it.',
  aboutNote:
    'Sample text: say who you are, where you are from and what you like doing.',
  howIWork: 'How I work',
  howIWorkItems: [
    'I start by listening, before I suggest anything',
    'I show the work as it grows, not only at the end',
    'I leave everything documented, so it can go on without me',
  ],
  contactHero: {
    eyebrow: 'Contact',
    title: 'Write to me',
    subtitle: 'Tell me in a few lines what you have in mind: I reply myself.',
  },
  contactFormName: 'Contact',
  fieldLabels: { name: 'Name', email: 'Email', message: 'Message' },
  footerLine: (siteName) => `${siteName}. All rights reserved.`,
  projectsList: [
    {
      key: 'libreria',
      slug: 'website-for-a-bookshop',
      title: 'A website for a neighbourhood bookshop',
      summary:
        'A simple site for a bookshop: the books they pick, the events, a way to get in touch.',
      start:
        'The bookshop had loyal customers and no presence online. They wanted to be found without turning into a digital shop.',
      did: [
        'I collected the questions customers ask most often',
        'I designed a site of a few pages, easy to update by themselves',
        'I set up a calendar for the author events',
      ],
      result:
        'Now anyone looking for the shop finds the opening hours, the month’s events and a form to write. Updating takes a few minutes.',
    },
    {
      key: 'caffe',
      slug: 'identity-for-a-cafe',
      title: 'Visual identity for a café',
      summary:
        'A mark, the colours and the rules for using them, from the window to the cup.',
      start:
        'A new café was looking for an identity that people would recognise, one that held up on the sign and on a five-centimetre sticker.',
      did: [
        'I studied the neighbourhood and the places around it',
        'I suggested three directions and we chose one together',
        'I wrote a page of simple rules for using the mark and the colours',
      ],
      result:
        'The café has a consistent look on its sign, its menu and its socials, and the people there know how to use it without asking every time.',
    },
    {
      key: 'prenotazioni',
      slug: 'app-for-booking-pitches',
      title: 'An app for booking sports pitches',
      summary:
        'Book a pitch in three taps, and for the people who run them a calendar you can read at a glance.',
      start:
        'The sports centre took bookings by phone and on a sheet of paper. Double bookings happened, and Monday mornings were chaos.',
      did: [
        'I watched how the front desk worked for a week',
        'I cut the booking path down to three essential steps',
        'I tried a test version with a few regulars',
      ],
      result:
        'Bookings now arrive in order and without doubles. The front desk answers the phone only for the exceptions.',
    },
  ],
};

export const portfolioStarter: Starter = {
  id: 'portfolio',
  themeName: 'classic',
  content: {
    it: (context) => build(context, italianWords),
    en: (context) => build(context, englishWords),
  },
};
