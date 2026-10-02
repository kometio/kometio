import { GENERATION_CATALOG, type GenerableBlock } from './generation-catalog';

/*
 * What the model is told. Two parts, kept apart on purpose: the stable
 * one (how to build a page, and the blocks there are) is the same on every
 * call and is what a provider caches; the context (this site, this page,
 * this language) changes with every request and comes after it.
 */

/** Built once from the catalogue: nothing in it changes between calls. */
export function buildStableInstructions(): string {
  const blocks = Object.entries(GENERATION_CATALOG)
    .map(([type, spec]: [string, GenerableBlock]) => {
      const where = spec.root ? 'top level' : 'inside another block only';
      const holds = spec.children?.length
        ? ` Holds: ${spec.children.join(', ')}.`
        : '';
      const writes = spec.writes.length
        ? ` You write: ${spec.writes.join(', ')}.`
        : ' You write no props: send {}.';
      return `- ${type} (${where}). ${spec.purpose}${writes}${holds}`;
    })
    .join('\n');

  return `You build web pages for Kometio, a website builder, out of the blocks below and nothing else.

Answer with JSON only: {"blocks": [...]}, a FLAT list. Each block is {"ref", "parent", "type", "props"}:
- ref: a short name of your own for the block, unique in the page.
- parent: the ref of the block it sits in, or null at the top of the page. A block's parent must come BEFORE it in the list.
- type and props: one of the blocks below, with only the props it lists.

How to write a good page:
- Open with a Hero, then sections that each do one thing, and end with a clear next step (a Banner or a Button).
- Write real, specific copy for the business described, in the language asked for. Plain words; no filler such as "elevate", "seamless", "unleash"; no exclamation marks.
- Never invent facts: no customer names, quotes presented as real, prices, figures, addresses, phone numbers or awards. The blocks that would need them are filled with placeholders by the server; write only what the block asks for.
- Pictures are empty slots the person fills; never describe or invent an image, a URL or a link to a page.
- A Button or Banner gets a url only when the request gives an address; otherwise leave url empty.
- Rich text (Hero subtitle, Text body, MediaText body, AccordionItem answer) is simple HTML: <p>, <strong>, <em>, <ul>, <li>. Nothing else.
- 8 to 25 blocks is a usual page.

The blocks:
${blocks}`;
}

export interface GenerationContext {
  /** The site's name, as its owner wrote it. */
  siteName: string;
  /** What kind of business it is, when the site says (schema.org type). */
  businessType: string | null;
  /** The page's language, e.g. `it` or `en-GB`. */
  locale: string;
  /**
   * For a page that already has content: its outline (block types and
   * headings, top level), so what is added fits what is there.
   */
  existingOutline?: readonly string[];
}

export function buildContextInstructions(context: GenerationContext): string {
  const language = languageName(context.locale);
  const lines = [
    `The site: "${context.siteName}"${context.businessType ? `, a ${context.businessType}` : ''}.`,
    `Write everything in ${language} (${context.locale}).`,
  ];
  if (context.existingOutline?.length) {
    lines.push(
      'The page already holds, in order:',
      ...context.existingOutline.map((line) => `- ${line}`),
      'Write only the new sections asked for; they will be added to it, so do not repeat its Hero.',
    );
  }
  return lines.join('\n');
}

function languageName(locale: string): string {
  try {
    return (
      new Intl.DisplayNames(['en'], { type: 'language' }).of(locale) ?? locale
    );
  } catch {
    return locale;
  }
}
