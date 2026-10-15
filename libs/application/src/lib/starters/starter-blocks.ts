import { normalizeRichText } from '@kometio/rich-text';
import type { Block, FormField } from '@kometio/shared-types';
import type { StarterReferenceKind } from './starter';

/**
 * The words a starter is written in: one function per block it uses, each
 * giving the props the block's schema asks for and nothing else, so what a
 * starter says reads like the page it makes.
 *
 * A starter is data. It cannot know the id of a page that does not exist
 * yet, so where one block points at another page, a form or a term it names
 * it by its key (`reference`), and `resolveStarterReferences` puts the real
 * id there when the thing is made.
 */

const REFERENCE_PREFIX = 'starter';

export function reference(kind: StarterReferenceKind, key: string): string {
  return `${REFERENCE_PREFIX}:${kind}:${key}`;
}

const REFERENCE_PATTERN = /^starter:(page|form|taxonomy|term):([a-z0-9-]+)$/;

/** What a string names, or `null` for any other string: a title is never mistaken for a reference. */
export function parseReference(
  value: string,
): { kind: StarterReferenceKind; key: string } | null {
  const match = REFERENCE_PATTERN.exec(value);
  const kind = match?.[1];
  const key = match?.[2];
  if (kind === 'page' || kind === 'form' || kind === 'taxonomy') {
    return key === undefined ? null : { kind, key };
  }
  if (kind === 'term' && key !== undefined) return { kind, key };
  return null;
}

/** Where a link goes: a page of the same starter, or an address. */
export type Destination =
  { kind: 'page'; key: string; title: string } | { kind: 'url'; url: string };

export const toPage = (key: string, title: string): Destination => ({
  kind: 'page',
  key,
  title,
});
export const toUrl = (url: string): Destination => ({ kind: 'url', url });

function linkProps(to: Destination) {
  return to.kind === 'page'
    ? {
        linkType: 'page' as const,
        page: { pageGroupId: reference('page', to.key), title: to.title },
        url: '',
      }
    : { linkType: 'url' as const, page: null, url: to.url };
}

function make(
  type: string,
  props: Record<string, unknown>,
  children?: Block[],
  extras: Pick<Block, 'variant' | 'align' | 'styleOverride'> = {},
): Block {
  return {
    type,
    props,
    ...(children ? { children } : {}),
    ...extras,
  };
}

// --- Content ---------------------------------------------------------------

/**
 * A Hero is a centred block, and a Button inside it takes the width of the
 * hero unless it is told where to sit: so a hero with buttons says so, and
 * the buttons are the size of their words.
 *
 * `align` is where its words and its blocks sit. A starter whose theme is
 * set on the left (the blog, the portfolio: `paper` and `colour` are) says
 * `start`; without it a hero is the centred one it has always been, and
 * only a hero with buttons spells that out.
 */
export function hero(
  props: { eyebrow?: string; title: string; subtitle?: string },
  children: Block[] = [],
  align?: 'start' | 'center' | 'end',
): Block {
  return make(
    'Hero',
    {
      eyebrow: props.eyebrow ?? '',
      title: props.title,
      subtitle: normalizeRichText(props.subtitle ?? ''),
    },
    children,
    align
      ? { styleOverride: { base: { contentAlign: align } } }
      : children.length > 0
        ? { styleOverride: { base: { contentAlign: 'center' } } }
        : {},
  );
}

export function heading(text: string, level: 'h2' | 'h3' = 'h2'): Block {
  return make('Heading', { text, level });
}

/** Paragraphs are separated by a blank line. */
export function text(body: string): Block {
  return make('Text', { body: normalizeRichText(body) });
}

export function button(
  label: string,
  to: Destination,
  look?: 'secondary' | 'outline' | 'ghost',
): Block {
  return make(
    'Button',
    { label, ...linkProps(to) },
    undefined,
    look ? { variant: look } : {},
  );
}

export function callout(
  message: string,
  tone: 'info' | 'success' | 'warning' = 'info',
): Block {
  return make('Callout', { message: normalizeRichText(message), tone });
}

export function list(items: string[]): Block {
  return make(
    'List',
    { marker: 'bullet' },
    items.map((item) => make('ListItem', { text: normalizeRichText(item) })),
  );
}

export function divider(): Block {
  return make('Divider', {});
}

export function quote(body: string, author = '', role = ''): Block {
  return make('PullQuote', {
    quote: normalizeRichText(body),
    author,
    role,
    align: 'center',
  });
}

export interface FeatureInput {
  title: string;
  text: string;
  /** A Lucide icon name. */
  icon?: string;
}

export function featureGrid(features: FeatureInput[]): Block {
  return make(
    'FeatureGrid',
    { display: 'grid' },
    features.map((feature) =>
      make('Feature', {
        icon: feature.icon ?? null,
        title: feature.title,
        text: normalizeRichText(feature.text),
      }),
    ),
  );
}

export function steps(items: { title: string; description: string }[]): Block {
  return make(
    'Steps',
    { orientation: 'horizontal' },
    items.map((item) =>
      make('Step', {
        title: item.title,
        description: normalizeRichText(item.description),
      }),
    ),
  );
}

export function faq(items: { question: string; answer: string }[]): Block {
  return make(
    'Faq',
    { structuredData: true },
    items.map((item) =>
      make('AccordionItem', {
        question: item.question,
        answer: normalizeRichText(item.answer),
      }),
    ),
  );
}

export function banner(props: {
  title: string;
  text: string;
  buttonLabel: string;
  to: Destination;
}): Block {
  return make('Banner', {
    title: props.title,
    text: normalizeRichText(props.text),
    buttonLabel: props.buttonLabel,
    ...linkProps(props.to),
  });
}

// --- The site's own listings ------------------------------------------------

export function subPages(
  parent: { key: string; title: string },
  layout: 'list' | 'grid' | 'cards' = 'cards',
  limit = 0,
): Block {
  return make('SubPages', {
    parent: { pageGroupId: reference('page', parent.key), title: parent.title },
    layout,
    limit,
  });
}

export function pageGrid(
  termKey: string,
  options: { layout?: 'list' | 'grid' | 'cards'; limit?: number } = {},
): Block {
  return make('PageGrid', {
    termId: reference('term', termKey),
    layout: options.layout ?? 'cards',
    order: 'newest',
    limit: options.limit ?? 0,
  });
}

export function termList(taxonomyKey: string): Block {
  return make('TermList', {
    taxonomyId: reference('taxonomy', taxonomyKey),
    behaviour: 'browse',
    style: 'chips',
    showAll: false,
  });
}

export function articleMeta(): Block {
  return make('ArticleMeta', { showDate: true, showAuthor: true });
}

export function form(formKey: string, formName: string): Block {
  return make('Form', {
    form: { formId: reference('form', formKey), formName },
  });
}

// --- The site's chrome ------------------------------------------------------

export function navLink(
  label: string,
  to: Destination,
  options: {
    position?: 'left' | 'right';
    visibility?: 'always' | 'desktop-only' | 'mobile-only';
  } = {},
): Block {
  return make('NavLink', {
    label,
    ...linkProps(to),
    position: options.position ?? 'left',
    visibility: options.visibility ?? 'always',
  });
}

export function nav(children: Block[]): Block {
  return make('Nav', { visibility: 'always' }, children);
}

/** The panel a narrow screen opens: its own links, since it is not a collapsed copy of the row. */
export function hamburgerMenu(links: Block[]): Block {
  return make(
    'HamburgerMenu',
    { position: 'right', visibility: 'mobile-only' },
    links,
  );
}

/**
 * A header: the site's name as a link home, then the pages — in a row from a
 * tablet up and in a panel below it.
 */
export function header(
  siteName: string,
  home: Destination,
  pages: { label: string; to: Destination }[],
): Block[] {
  return [
    nav([
      navLink(siteName, home),
      ...pages.map((page, index) =>
        navLink(page.label, page.to, {
          position: index === 0 ? 'right' : 'left',
          visibility: 'desktop-only',
        }),
      ),
      hamburgerMenu(pages.map((page) => navLink(page.label, page.to))),
    ]),
  ];
}

/** A footer: the name and a short line, and the same pages as the header. */
export function footer(
  line: string,
  pages: { label: string; to: Destination }[],
): Block[] {
  return [nav(pages.map((page) => navLink(page.label, page.to))), text(line)];
}

// --- Forms ------------------------------------------------------------------

/** A contact form's three fields, with the labels in the language of the site. */
export function contactFields(labels: {
  name: string;
  email: string;
  message: string;
}): FormField[] {
  return [
    { id: 'name', label: labels.name, type: 'text', required: true },
    { id: 'email', label: labels.email, type: 'email', required: true },
    { id: 'message', label: labels.message, type: 'textarea', required: true },
  ];
}
