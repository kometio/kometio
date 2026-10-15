import {
  articleMeta,
  callout,
  footer,
  header,
  heading,
  hero,
  list,
  pageGrid,
  termList,
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
 * A site that is written regularly: a home that lists the latest by
 * category, a page about the author and three articles. An article is a page
 * with no type of its own: it is listed in the section "Articles" of the
 * editor, and filed under a category, which is what puts it in the lists of
 * the home (a listing reads categories, not sections). The articles are
 * examples and say so.
 */

interface Article {
  key: string;
  slug: string;
  title: string;
  summary: string;
  category: 'appunti' | 'guide';
  paragraphs: string[];
  points: { heading: string; items: string[] };
}

interface Words {
  collection: string;
  taxonomy: string;
  categories: { appunti: string; guide: string };
  home: { description: string };
  hero: { eyebrow: string; title: string; subtitle: string };
  listsHeading: { appunti: string; guide: string };
  categoriesHeading: string;
  about: {
    title: string;
    slug: string;
    description: string;
    hero: { eyebrow: string; title: string; subtitle: string };
    text: string;
    note: string;
  };
  exampleNote: string;
  footerLine: (siteName: string) => string;
  articles: Article[];
}

function build({ siteName }: StarterContext, words: Words): StarterContent {
  const home = toPage('home', siteName);
  const menu = [
    { label: words.about.title, to: toPage('chi-sono', words.about.title) },
  ];

  const articlePages: StarterPage[] = words.articles.map((article) => ({
    key: article.key,
    slug: article.slug,
    title: article.title,
    description: article.summary,
    collection: 'articoli',
    terms: [article.category],
    content: [
      hero(
        {
          eyebrow: words.categories[article.category],
          title: article.title,
          subtitle: article.summary,
        },
        [],
        'start',
      ),
      articleMeta(),
      callout(words.exampleNote),
      ...article.paragraphs.map((paragraph) => text(paragraph)),
      heading(article.points.heading),
      list(article.points.items),
    ],
  }));

  return {
    header: header(siteName, home, menu),
    footer: footer(words.footerLine(siteName), menu),
    forms: [],
    collections: [
      { key: 'articoli', name: words.collection, icon: 'newspaper' },
    ],
    taxonomies: [
      {
        key: 'categorie',
        name: words.taxonomy,
        terms: [
          { key: 'appunti', name: words.categories.appunti },
          { key: 'guide', name: words.categories.guide },
        ],
      },
    ],
    pages: [
      {
        key: 'home',
        slug: 'home',
        title: siteName,
        description: words.home.description,
        content: [
          hero(words.hero, [], 'start'),
          heading(words.listsHeading.appunti),
          pageGrid('appunti', { layout: 'cards', limit: 6 }),
          heading(words.listsHeading.guide),
          pageGrid('guide', { layout: 'cards', limit: 6 }),
          heading(words.categoriesHeading),
          termList('categorie'),
        ],
      },
      {
        key: 'chi-sono',
        slug: words.about.slug,
        title: words.about.title,
        description: words.about.description,
        content: [
          hero(words.about.hero, [], 'start'),
          text(words.about.text),
          callout(words.about.note),
        ],
      },
      ...articlePages,
    ],
  };
}

const italianWords: Words = {
  collection: 'Articoli',
  taxonomy: 'Categorie',
  categories: { appunti: 'Appunti', guide: 'Guide' },
  home: {
    description: 'Appunti, idee e cose imparate strada facendo.',
  },
  hero: {
    eyebrow: 'Blog',
    title: 'Appunti, idee e cose imparate strada facendo',
    subtitle: 'Un posto dove scrivere con calma di ciò che mi interessa.',
  },
  listsHeading: { appunti: 'Ultimi appunti', guide: 'Guide' },
  categoriesHeading: 'Categorie',
  about: {
    title: 'Chi sono',
    slug: 'chi-sono',
    description: 'Chi scrive qui e di cosa.',
    hero: {
      eyebrow: 'Chi sono',
      title: 'Chi scrive qui',
      subtitle: 'Due righe su di me e su cosa trovi in questo blog.',
    },
    text: 'Scrivo di ciò che imparo mentre lavoro, e di ciò che avrei voluto sapere prima. Non è un blog che esce ogni giorno: esce quando c’è qualcosa da dire.',
    note: 'Testo di esempio: racconta chi sei e di cosa scrivi.',
  },
  exampleNote:
    'Articolo di esempio: modificalo, sostituiscilo o eliminalo quando vuoi.',
  footerLine: (siteName) => `${siteName}. Tutti i diritti riservati.`,
  articles: [
    {
      key: 'inizio',
      slug: 'da-dove-comincia-un-buon-articolo',
      title: 'Da dove comincia un buon articolo',
      summary: 'Prima delle parole viene la domanda a cui l’articolo risponde.',
      category: 'appunti',
      paragraphs: [
        'Quasi sempre un articolo che funziona risponde a una domanda precisa, e di solito è una domanda che qualcuno ti ha fatto davvero. Se parti da lì, il resto si ordina da solo: sai cosa deve esserci e cosa può restare fuori.',
        'Prima di scrivere conviene dirla in una frase. Se non ci riesci, probabilmente stai ancora decidendo di cosa parlare, e va bene: è un buon momento per fermarti.',
      ],
      points: {
        heading: 'Prima di cominciare',
        items: [
          'Chi leggerà, e cosa vuole sapere?',
          'Qual è la domanda, in una frase?',
          'Cosa può restare fuori?',
        ],
      },
    },
    {
      key: 'regolarita',
      slug: 'scrivere-poco-ma-con-regolarita',
      title: 'Scrivere poco, ma con regolarità',
      summary:
        'Un articolo breve ogni tanto vale più di uno lungo mai pubblicato.',
      category: 'appunti',
      paragraphs: [
        'La tentazione è scrivere l’articolo definitivo. Il risultato, spesso, è che resta nella cartella delle bozze. Una nota breve, pubblicata, insegna di più: ti abitui al ritmo e a chi ti legge.',
        'Scegli una cadenza che puoi mantenere senza fatica, anche solo una al mese, e tienila.',
      ],
      points: {
        heading: 'Per cominciare',
        items: [
          'Scegli un giorno del mese e proteggilo',
          'Tieni un elenco di idee da cui pescare',
          'Pubblica, anche se non è perfetto',
        ],
      },
    },
    {
      key: 'primo-articolo',
      slug: 'guida-pubblicare-il-primo-articolo',
      title: 'Guida: pubblicare il tuo primo articolo',
      summary: 'Dalla bozza all’elenco della home, passo per passo.',
      category: 'guide',
      paragraphs: [
        'Un articolo è una pagina come le altre, e sta nella sezione Articoli dell’editor. Creane una nuova da lì: scrivi il titolo, aggiungi i blocchi che ti servono e pubblica quando sei pronto.',
        'Per farlo comparire negli elenchi della home, archivialo in una categoria: è la categoria a decidere in quale elenco finisce.',
      ],
      points: {
        heading: 'In breve',
        items: [
          'Crea una pagina nuova dalla sezione Articoli',
          'Scrivi il titolo e il testo',
          'Scegli la categoria e pubblica',
        ],
      },
    },
  ],
};

const englishWords: Words = {
  collection: 'Articles',
  taxonomy: 'Categories',
  categories: { appunti: 'Notes', guide: 'Guides' },
  home: {
    description: 'Notes, ideas and things learned along the way.',
  },
  hero: {
    eyebrow: 'Blog',
    title: 'Notes, ideas and things learned along the way',
    subtitle: 'A place to write, unhurried, about what interests me.',
  },
  listsHeading: { appunti: 'Latest notes', guide: 'Guides' },
  categoriesHeading: 'Categories',
  about: {
    title: 'About me',
    slug: 'about-me',
    description: 'Who writes here, and about what.',
    hero: {
      eyebrow: 'About me',
      title: 'Who writes here',
      subtitle: 'A couple of lines about me and what you will find here.',
    },
    text: 'I write about what I learn while I work, and what I wish I had known before. This is not a blog that comes out every day: it comes out when there is something to say.',
    note: 'Sample text: say who you are and what you write about.',
  },
  exampleNote:
    'Sample article: edit it, replace it or delete it whenever you like.',
  footerLine: (siteName) => `${siteName}. All rights reserved.`,
  articles: [
    {
      key: 'inizio',
      slug: 'where-a-good-article-starts',
      title: 'Where a good article starts',
      summary: 'Before the words comes the question the article answers.',
      category: 'appunti',
      paragraphs: [
        'An article that works almost always answers a specific question, and usually one somebody has actually asked you. Start there and the rest sorts itself out: you know what has to be in and what can stay out.',
        'It helps to say it in one sentence before you write. If you cannot, you are probably still deciding what to write about, and that is fine: it is a good moment to stop.',
      ],
      points: {
        heading: 'Before you start',
        items: [
          'Who will read it, and what do they want to know?',
          'What is the question, in one sentence?',
          'What can stay out?',
        ],
      },
    },
    {
      key: 'regolarita',
      slug: 'write-little-but-often',
      title: 'Write little, but often',
      summary: 'A short article now and then beats a long one never published.',
      category: 'appunti',
      paragraphs: [
        'The temptation is to write the definitive article. Too often it ends up in the drafts folder. A short note, published, teaches you more: you get used to the rhythm and to the people who read you.',
        'Pick a pace you can keep without effort, even just once a month, and keep it.',
      ],
      points: {
        heading: 'To get going',
        items: [
          'Pick a day of the month and protect it',
          'Keep a list of ideas to draw from',
          'Publish, even if it is not perfect',
        ],
      },
    },
    {
      key: 'primo-articolo',
      slug: 'guide-publishing-your-first-article',
      title: 'Guide: publishing your first article',
      summary: 'From the draft to the home page list, step by step.',
      category: 'guide',
      paragraphs: [
        'An article is a page like any other, and it lives in the Articles section of the editor. Create a new one from there: write the title, add the blocks you need and publish when you are ready.',
        'To make it show in the home page lists, file it under a category: the category decides which list it ends up in.',
      ],
      points: {
        heading: 'In short',
        items: [
          'Create a new page from the Articles section',
          'Write the title and the text',
          'Pick the category and publish',
        ],
      },
    },
  ],
};

export const blogStarter: Starter = {
  id: 'blog',
  themeName: 'paper',
  content: {
    it: (context) => build(context, italianWords),
    en: (context) => build(context, englishWords),
  },
};
