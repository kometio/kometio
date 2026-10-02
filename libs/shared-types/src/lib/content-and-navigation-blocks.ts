import { z } from 'zod';
import {
  pageGridItemSchema,
  pickedMediaSchema,
  pickedPageSchema,
} from './content-model';

/*
 * The fifth family of the hundred-blocks plan (decided 2026-09-13):
 * navigation inside a page, navigation across the site, the content blocks
 * every WordPress site has, and the business data and files a site already
 * keeps. Thirteen blocks the owner chose, plus `ListItem`, the child a
 * list is made of.
 *
 * Whatever a block shows that the site already knows — the page's
 * headings, its children and siblings, its address and hours — is filled
 * in when the page is read and never typed. A typed copy is a second
 * answer that disagrees with the first the day somebody edits either.
 */

// --- Inside a page -------------------------------------------------------

/** A point in the page a link can land on: `#prices`. */
export const anchorPropsSchema = z.object({
  /** Written as a slug when the page renders, so "Our prices" answers at `#our-prices`. */
  name: z.string().default(''),
});
export type AnchorProps = z.infer<typeof anchorPropsSchema>;

/** A thin bar that fills as the reader scrolls. Decoration: it tells a screen reader nothing new. */
export const readingProgressPropsSchema = z.object({
  position: z.enum(['top', 'bottom']).default('top'),
});
export type ReadingProgressProps = z.infer<typeof readingProgressPropsSchema>;

export const tableOfContentsEntrySchema = z.object({
  anchorId: z.string(),
  text: z.string(),
  level: z.enum(['h2', 'h3']),
});
export type TableOfContentsEntry = z.infer<typeof tableOfContentsEntrySchema>;

/**
 * The page's own headings, as links to them.
 *
 * `entries` is filled by the render pass, which also gives every heading
 * it lists the `anchorId` the link points at: a table of contents kept by
 * hand is wrong the first time a heading is renamed.
 */
export const tableOfContentsPropsSchema = z.object({
  title: z.string().default(''),
  /** `h2` lists the sections; `h3` adds what is inside them. */
  depth: z.enum(['h2', 'h3']).default('h3'),
  numbered: z.boolean().default(false),
  entries: z.array(tableOfContentsEntrySchema).default([]),
});
export type TableOfContentsProps = z.infer<typeof tableOfContentsPropsSchema>;

// --- Across the site -----------------------------------------------------

/** The pages filed under this one — or under a page chosen by hand. */
export const subPagesPropsSchema = z.object({
  /** `null` means this page's own children, which is what a section's index page wants. */
  parent: pickedPageSchema.nullable().default(null),
  layout: z.enum(['list', 'grid', 'cards']).default('list'),
  /** 0 = every child. */
  limit: z.number().int().min(0).max(100).default(0),
  items: z.array(pageGridItemSchema).default([]),
});
export type SubPagesProps = z.infer<typeof subPagesPropsSchema>;

/**
 * The page before and the page after this one, among its siblings, in the
 * order the page tree gives them — what a manual or a course is read in.
 * Not `ArticleNav`, which orders a collection by date.
 */
export const siblingPagesPropsSchema = z.object({
  previous: pageGridItemSchema.nullable().default(null),
  next: pageGridItemSchema.nullable().default(null),
});
export type SiblingPagesProps = z.infer<typeof siblingPagesPropsSchema>;

export interface SiteMapNode {
  title: string;
  path: string;
  children: SiteMapNode[];
}

export const siteMapNodeSchema: z.ZodType<SiteMapNode> = z.lazy(() =>
  z.object({
    title: z.string(),
    path: z.string(),
    children: z.array(siteMapNodeSchema),
  }),
);

/** Every published page, as the nested list the page tree already is. */
export const siteMapPropsSchema = z.object({
  /** How many levels down. A site with a deep manual does not want all of it on one page. */
  depth: z.number().int().min(1).max(6).default(3),
  tree: z.array(siteMapNodeSchema).default([]),
});
export type SiteMapProps = z.infer<typeof siteMapPropsSchema>;

// --- Content -------------------------------------------------------------

/** A list whose items are blocks, so each one is edited, moved and translated in place. */
export const listPropsSchema = z.object({
  marker: z.enum(['bullet', 'number', 'check', 'icon']).default('bullet'),
  /** The icon every item wears when `marker` is `icon`. */
  icon: z.string().default('star'),
});
export type ListProps = z.infer<typeof listPropsSchema>;

export const listItemPropsSchema = z.object({
  text: z.string().default(''),
});
export type ListItemProps = z.infer<typeof listItemPropsSchema>;

/** A picture beside words — the layout half of every WordPress site is built from. */
export const mediaTextPropsSchema = z.object({
  media: pickedMediaSchema.nullable().default(null),
  alt: z.string().default(''),
  heading: z.string().default(''),
  body: z.string().default(''),
  /** `start` is left in a left-to-right language and right in Arabic or Hebrew: the block follows the page's direction. */
  mediaSide: z.enum(['start', 'end']).default('start'),
  mediaWidth: z.enum(['third', 'half', 'two-thirds']).default('half'),
  verticalAlign: z.enum(['start', 'center', 'end']).default('center'),
});
export type MediaTextProps = z.infer<typeof mediaTextPropsSchema>;

/**
 * Questions and answers — `AccordionItem`s — that also tell search engines
 * what they are, as schema.org `FAQPage`.
 */
export const faqPropsSchema = z.object({
  structuredData: z.boolean().default(true),
});
export type FaqProps = z.infer<typeof faqPropsSchema>;

/** Anything, scrolling sideways without end. Still, and simply wrapped, for a reader who asked for less motion. */
export const marqueePropsSchema = z.object({
  speed: z.enum(['slow', 'normal', 'fast']).default('normal'),
  direction: z.enum(['forward', 'backward']).default('forward'),
  pauseOnHover: z.boolean().default(true),
});
export type MarqueeProps = z.infer<typeof marqueePropsSchema>;

// --- Business data and files ---------------------------------------------

/** The site's address and phone, from Business info — never retyped on a page. */
export const contactDetailsPropsSchema = z.object({
  showAddress: z.boolean().default(true),
  showPhone: z.boolean().default(true),
  showEmail: z.boolean().default(true),
  /** A link that opens the address in the reader's maps app. */
  showMapLink: z.boolean().default(true),
});
export type ContactDetailsProps = z.infer<typeof contactDetailsPropsSchema>;

/** The site's opening hours, from Business info. */
export const openingHoursPropsSchema = z.object({
  title: z.string().default(''),
});
export type OpeningHoursProps = z.infer<typeof openingHoursPropsSchema>;

/** A file from the library, as a link that downloads it. */
export const fileDownloadPropsSchema = z.object({
  file: pickedMediaSchema.nullable().default(null),
  /** What the link says. Empty = the file's own name. */
  label: z.string().default(''),
  /** Its type and size beside the link, so nobody downloads 40 MB by surprise. */
  showDetails: z.boolean().default(true),
});
export type FileDownloadProps = z.infer<typeof fileDownloadPropsSchema>;
