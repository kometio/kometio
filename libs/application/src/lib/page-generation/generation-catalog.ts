import type { BlockType, PlaceholderKey } from '@kometio/shared-types';

/**
 * The blocks a page generated from a prompt may use, and how (docs/adr —
 * page generation). Not every block: a model given all of them writes
 * worse pages, and some cannot be filled from a prompt at all — a Form or a
 * reusable Section points at something that must already exist, a video
 * needs a file, a page list depends on the site's own tree.
 *
 * For each block:
 * - `writes`: the props the model writes. Everything else is set here, by
 *   the server, never by the model — so it cannot invent an image, a
 *   stored file or a link to a page that does not exist.
 * - `fixed`: those server-set props. An image is an empty slot for the
 *   person to fill; a link goes to an address the prompt gave, or nowhere.
 * - `placeholders`: props that would otherwise be invented facts about real
 *   people or numbers (a customer's name, a price, a count). They are set to
 *   an obvious placeholder instead, and the editor says the page still has
 *   some: a site that publishes made-up reviews or figures misleads the
 *   people reading it.
 * - `children`: the block types it holds. Absent means it holds none.
 * - `root`: whether it may stand at the top level of the page.
 */
export interface GenerableBlock {
  /** What it is for, told to the model in plain words. */
  purpose: string;
  writes: readonly string[];
  fixed?: Readonly<Record<string, unknown>>;
  placeholders?: Readonly<Record<string, PlaceholderKey>>;
  /** Left with a value the person has to fill in that is not text (a figure set to 0). */
  fillIn?: true;
  children?: readonly BlockType[];
  root: boolean;
}

/** Content that sits inside a column, a container or a card. */
const INNER = [
  'Heading',
  'Text',
  'Image',
  'Button',
  'List',
  'Callout',
] as const;

const NO_LINK = { linkType: 'url', page: null } as const;
const NO_IMAGE = { media: null, alt: '', isDecorative: false } as const;

export const GENERATION_CATALOG = {
  Hero: {
    purpose:
      'The opening of the page: an optional short eyebrow, the title, a subtitle, and usually one or two Buttons.',
    writes: ['eyebrow', 'title', 'subtitle'],
    children: ['Button'],
    root: true,
  },
  Heading: {
    purpose: 'A section title. h2 for a section, h3 inside one.',
    writes: ['text', 'level'],
    root: true,
  },
  Text: {
    purpose: 'Body copy, as simple HTML: <p>, <strong>, <em>, <ul>, <li>.',
    writes: ['body'],
    root: true,
  },
  Callout: {
    purpose: 'A short note set apart from the text around it.',
    writes: ['message', 'tone'],
    root: true,
  },
  PullQuote: {
    purpose:
      'One sentence of the page itself, set large. Never a quote from a person.',
    writes: ['quote'],
    fixed: { author: '', role: '' },
    root: true,
  },
  List: {
    purpose: 'A list of short points, one ListItem each.',
    writes: ['marker'],
    children: ['ListItem'],
    root: true,
  },
  ListItem: {
    purpose: 'One point of a List.',
    writes: ['text'],
    root: false,
  },
  Image: {
    purpose:
      'A place for a picture. It is left empty for the person to choose one; say nothing about what it shows.',
    writes: ['aspectRatio'],
    fixed: { ...NO_IMAGE, caption: '', linkType: 'none', page: null, url: '' },
    root: true,
  },
  MediaText: {
    purpose:
      'A heading and text beside a picture (the picture is left empty for the person to choose).',
    writes: ['heading', 'body', 'mediaSide'],
    fixed: { media: null, alt: '' },
    root: true,
  },
  Card: {
    purpose:
      'A card with an empty picture slot on top and a few blocks under it; usually several side by side in Columns.',
    writes: [],
    fixed: NO_IMAGE,
    children: ['Heading', 'Text', 'Button', 'List'],
    root: false,
  },
  Columns: {
    purpose: 'Side-by-side columns, one Column each (2 to 4).',
    writes: [],
    children: ['Column'],
    root: true,
  },
  Column: {
    purpose: 'One column of Columns.',
    writes: [],
    children: [...INNER, 'Card'],
    root: false,
  },
  Container: {
    purpose:
      'A band that groups a few blocks, optionally on a coloured background.',
    writes: ['background', 'padding'],
    children: [...INNER, 'Columns'],
    root: true,
  },
  Divider: {
    purpose: 'A horizontal rule between two sections.',
    writes: [],
    root: true,
  },
  Button: {
    purpose:
      'A call to action. url only when the prompt gives an address; otherwise leave it empty.',
    writes: ['label', 'url'],
    fixed: { ...NO_LINK, icon: null },
    root: true,
  },
  Banner: {
    purpose:
      'A closing call to action: title, one sentence, a button. url only when the prompt gives one.',
    writes: ['title', 'text', 'buttonLabel', 'url'],
    fixed: NO_LINK,
    root: true,
  },
  NewsletterSignup: {
    purpose: 'An invitation to subscribe to a newsletter.',
    writes: ['title', 'buttonLabel'],
    root: true,
  },
  FeatureGrid: {
    purpose: 'What is offered, 3 to 6 Features.',
    writes: [],
    children: ['Feature'],
    root: true,
  },
  Feature: {
    purpose:
      'One feature: a Lucide icon name in kebab-case (it is dropped if the theme lacks it), a title, one or two sentences.',
    writes: ['icon', 'title', 'text'],
    root: false,
  },
  Steps: {
    purpose: 'How something works, 3 to 5 Steps in order.',
    writes: ['orientation'],
    children: ['Step'],
    root: true,
  },
  Step: {
    purpose: 'One step of Steps.',
    writes: ['title', 'description'],
    root: false,
  },
  Faq: {
    purpose: 'Frequently asked questions, one AccordionItem each.',
    writes: [],
    children: ['AccordionItem'],
    root: true,
  },
  AccordionItem: {
    purpose: 'One question and its answer (the answer as simple HTML).',
    writes: ['question', 'answer'],
    root: false,
  },
  Timeline: {
    purpose: 'A sequence in time, one TimelineStep each.',
    writes: [],
    children: ['TimelineStep'],
    root: true,
  },
  TimelineStep: {
    purpose:
      'One moment of a Timeline: a short label (a year, a phase), a title, a sentence.',
    writes: ['label', 'title', 'description'],
    root: false,
  },
  PricingTable: {
    purpose: 'Plans side by side, 2 to 4 PricingPlans.',
    writes: [],
    children: ['PricingPlan'],
    root: true,
  },
  PricingPlan: {
    purpose:
      'One plan: its name, what it includes, a button. The price is left for the person to fill in.',
    writes: ['name', 'period', 'features', 'highlighted', 'buttonLabel', 'url'],
    fixed: NO_LINK,
    placeholders: { price: 'price' },
    root: false,
  },
  ContactDetails: {
    purpose:
      "The site's own address, phone and email, taken from its settings.",
    writes: ['showAddress', 'showPhone', 'showEmail', 'showMapLink'],
    root: true,
  },
  OpeningHours: {
    purpose: "The site's own opening hours, taken from its settings.",
    writes: ['title'],
    root: true,
  },
  Testimonials: {
    purpose:
      'Room for what customers say, 2 to 3 Testimonials. Names and roles are left for the person to fill in.',
    writes: [],
    children: ['Testimonial'],
    root: true,
  },
  Testimonial: {
    purpose:
      'An example of the kind of thing a customer might say, to be replaced by a real one.',
    writes: ['quote'],
    fixed: { avatar: null, rating: 5 },
    placeholders: { author: 'personName', role: 'role' },
    root: false,
  },
  Team: {
    purpose:
      'Room for the people behind the site. Names and roles are left to fill in.',
    writes: [],
    children: ['TeamMember'],
    root: true,
  },
  TeamMember: {
    purpose: 'One person, with an example bio to be replaced.',
    writes: ['bio'],
    fixed: { photo: null },
    placeholders: { name: 'teamMemberName', role: 'role' },
    root: false,
  },
  StatsCounter: {
    purpose:
      'Figures that matter, 3 to 4 Stats. The numbers are left for the person to fill in; write only what each counts.',
    writes: [],
    children: ['Stat'],
    root: true,
  },
  Stat: {
    purpose:
      'What one figure counts, with an optional prefix or suffix (+, %).',
    writes: ['prefix', 'suffix', 'label'],
    fixed: { value: 0 },
    fillIn: true,
    root: false,
  },
} as const satisfies Partial<Record<BlockType, GenerableBlock>>;

export type GenerableType = keyof typeof GENERATION_CATALOG;

export function isGenerableType(type: string): type is GenerableType {
  return Object.hasOwn(GENERATION_CATALOG, type);
}
