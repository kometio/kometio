import type { Block, PageContent, SeoMeta } from './content-model';
import { richTextToPlainText } from './rich-text-to-plain-text';
import { parseSectionOverrideKey } from './reusable-section';
import { eachBlock } from './block-tree';

/**
 * Builds the plain-text blob a SearchPort adapter indexes for a page —
 * kept here (not in the adapter) because only this package already knows
 * every block type's shape (content-model.ts), and extraction has nothing
 * Postgres-specific about it: a future non-Postgres SearchPort adapter
 * reuses this exact function, only the storage/query side differs.
 *
 * Explicit per-block-type allowlist of "prose" fields, not "grab every
 * string prop generically": most blocks also carry non-prose string props
 * (urls, hex colors, enum values like linkType/variant/layout) that would
 * otherwise pollute the index and produce false-positive matches (e.g.
 * searching "primary" matching every Button block).
 *
 * `PROSE_FIELD_EXTRACTORS`' own keys are the authoritative "which types
 * are covered" list — `BLOCKS_WITHOUT_SEARCHABLE_TEXT` below must account
 * for every OTHER real block type, checked by
 * `config.spec.ts`'s "search-text.ts prose-field coverage" test. This is
 * what makes forgetting a new block here a build-time failure instead of
 * the silent gap Heading shipped with (2026-09-01) — this file used to be
 * a plain `switch` with a `default: return []`, which is exactly what let
 * that happen unnoticed.
 */
export function extractSearchableText(
  seoMeta: SeoMeta,
  blocks: PageContent,
): string {
  const parts = [seoMeta.title, seoMeta.description];
  collectBlockText(blocks, parts);
  return parts.filter((part) => part.trim().length > 0).join(' ');
}

function collectBlockText(blocks: PageContent, parts: string[]): void {
  for (const block of eachBlock(blocks)) {
    parts.push(...proseFieldsFor(block));
  }
}

/**
 * Every prose value goes through `richTextToPlainText`, not only the ones
 * a registry would call rich text (ADR-0046). This file has no registry
 * to ask, and the function leaves a plain string untouched — so a field
 * that becomes rich text later is handled the day it changes, instead of
 * quietly indexing `<p>` and `<strong>` until someone notices the search
 * results have gone strange.
 */
function asString(value: unknown): string {
  return typeof value === 'string' ? richTextToPlainText(value) : '';
}

type ProseFieldExtractor = (props: Record<string, unknown>) => string[];

/**
 * A quote and who said it — Quote's fields, which a testimonial, a
 * product review and a pull quote all share because they are drawn by
 * the same two components.
 */
function quoteProse(props: Record<string, unknown>): string[] {
  return [
    asString(props['quote']),
    asString(props['author']),
    asString(props['role']),
  ];
}

/** A person: TeamMember's fields, which the profile card shares. */
function teamMemberProse(props: Record<string, unknown>): string[] {
  return [
    asString(props['name']),
    asString(props['role']),
    asString(props['bio']),
  ];
}

/**
 * The alt text of a list of pictures — Gallery's `{ media, alt }[]` shape,
 * which five blocks share under two different key names.
 *
 * Alt text is prose here for Image's reason: it is what the picture says
 * to someone who cannot see it, and on a logo strip it is the only place
 * a partner's name is written at all.
 */
function pictureAlts(key: string): ProseFieldExtractor {
  return (props) => {
    const pictures = Array.isArray(props[key]) ? props[key] : [];
    return pictures.map((picture: unknown) =>
      picture && typeof picture === 'object' && 'alt' in picture
        ? asString(picture.alt)
        : '',
    );
  };
}

const PROSE_FIELD_EXTRACTORS: Partial<Record<string, ProseFieldExtractor>> = {
  Hero: (props) => [asString(props['title']), asString(props['subtitle'])],
  // The accessible name of an icon-only link is real prose and the only
  // words the block has — someone searching for "Instagram" should find
  // the page whose footer links to it.
  SocialLink: (props) => [asString(props['label'])],
  // An icon's label is what it means when it is not decoration.
  Icon: (props) => [asString(props['label'])],
  Audio: (props) => [asString(props['title'])],
  Text: (props) => [asString(props['body'])],
  Heading: (props) => [asString(props['text'])],
  Image: (props) => [asString(props['alt']), asString(props['caption'])],
  // Its children index themselves; the header's alt is the card's own
  // only prose, and it is prose for Image's reason.
  Card: (props) => [asString(props['alt'])],
  /*
   * A section instance's own prose is the values it overrides — the
   * section's other words arrive as resolved CHILDREN, which
   * `collectBlockText` already walks (docs/adr/0059).
   *
   * Every `ovr:` prop and no allow-list of keys, unlike every other entry
   * here: which fields exist depends on the section, so there is no fixed
   * list to write. That is safe precisely because these keys can hold
   * nothing else — `sectionPropsSchema` refuses any key that is not an
   * override, so "every other string prop" is exactly "every value an
   * author typed".
   */
  Section: (props) =>
    Object.entries(props)
      .filter(([key]) => parseSectionOverrideKey(key) !== null)
      .map(([, value]) => asString(value)),
  Gallery: pictureAlts('images'),
  Quote: quoteProse,
  Rating: (props) => [asString(props['label'])],
  Countdown: (props) => [asString(props['label'])],
  Tab: (props) => [asString(props['label'])],
  Button: (props) => [asString(props['label'])],
  Table: (props) => {
    const rows = Array.isArray(props['rows']) ? props['rows'] : [];
    return rows.flat().map((cell) => asString(cell));
  },
  AccordionItem: (props) => [
    asString(props['question']),
    asString(props['answer']),
  ],
  Banner: (props) => [
    asString(props['title']),
    asString(props['text']),
    asString(props['buttonLabel']),
  ],
  Feature: (props) => [asString(props['title']), asString(props['text'])],
  PromoBar: (props) => [asString(props['message'])],
  WhatsAppButton: (props) => [asString(props['message'])],
  Callout: (props) => [asString(props['message'])],
  // What a person wrote on the page, so what a search should find it by.
  ListItem: (props) => [asString(props['text'])],
  MediaText: (props) => [asString(props['heading']), asString(props['body'])],
  TableOfContents: (props) => [asString(props['title'])],
  OpeningHours: (props) => [asString(props['title'])],
  FileDownload: (props) => [asString(props['label'])],
  // The last family of the hundred-blocks plan. Every one of these is
  // words somebody typed on this page — a product's name, a dish, an
  // event, a definition — so it is what a search should find the page by.
  ProductCard: (props) => [
    asString(props['name']),
    asString(props['description']),
    asString(props['badge']),
  ],
  // The pictures' alt text, for Gallery's reason.
  ProductGallery: pictureAlts('images'),
  DiscountPrice: (props) => [asString(props['note'])],
  BuyButton: (props) => [asString(props['label'])],
  ProductVariants: (props) => [
    asString(props['label']),
    asString(props['options']),
  ],
  ProductReview: quoteProse,
  Testimonial: quoteProse,
  ComparisonTable: (props) => [asString(props['columns'])],
  ComparisonRow: (props) => [
    asString(props['feature']),
    asString(props['values']),
  ],
  PromoCode: (props) => [
    asString(props['code']),
    asString(props['description']),
  ],
  ShippingReturns: (props) => [
    asString(props['shippingTitle']),
    asString(props['shippingText']),
    asString(props['returnsTitle']),
    asString(props['returnsText']),
    asString(props['supportTitle']),
    asString(props['supportText']),
  ],
  TrustBadges: (props) => [asString(props['text'])],
  MenuItem: (props) => [
    asString(props['name']),
    asString(props['description']),
    asString(props['dietary']),
    asString(props['allergens']),
  ],
  EventItem: (props) => [
    asString(props['title']),
    asString(props['location']),
    asString(props['description']),
  ],
  ShareButtons: (props) => [asString(props['label'])],
  CookiePreferences: (props) => [asString(props['label'])],
  Step: (props) => [asString(props['title']), asString(props['description'])],
  SpecItem: (props) => [asString(props['label']), asString(props['value'])],
  ProgressBar: (props) => [asString(props['label'])],
  ProfileCard: teamMemberProse,
  TeamMember: teamMemberProse,
  FileList: (props) => [asString(props['title'])],
  GlossaryTerm: (props) => [
    asString(props['term']),
    asString(props['definition']),
  ],
  PullQuote: quoteProse,
  ImageHotspots: (props) => [asString(props['alt'])],
  Hotspot: (props) => [asString(props['title']), asString(props['text'])],
  MasonryGallery: pictureAlts('images'),
  NavLink: (props) => [asString(props['label'])],
  NavDropdown: (props) => [asString(props['label'])],
  /*
   * The blocks whose prose search used to miss entirely — each one a
   * decision about which of its fields a visitor is actually looking for,
   * which is why they were left out of the 2026-09-02 batch rather than
   * wired up in bulk.
   *
   * What stays out, and why: an address's URL, a video's URL, a plan's
   * price and period, a statistic's prefix and suffix. A URL is not prose,
   * and a number with its unit ("29", "€", "al mese") matches across pages
   * that have nothing to do with each other — the plan's NAME is what
   * someone types.
   */
  BeforeAfter: (props) => [
    asString(props['beforeLabel']),
    asString(props['afterLabel']),
  ],
  // The snippet itself: on a documentation site, the name of a function
  // someone read here is exactly what they come back searching for.
  Code: (props) => [asString(props['code'])],
  ImageSlider: pictureAlts('images'),
  Link: (props) => [asString(props['label'])],
  LogoStrip: pictureAlts('logos'),
  // The address as written on the page — the street someone searches for.
  MapEmbed: (props) => [asString(props['address'])],
  NewsletterSignup: (props) => [
    asString(props['title']),
    asString(props['buttonLabel']),
  ],
  PricingPlan: (props) => [
    asString(props['name']),
    asString(props['buttonLabel']),
  ],
  Stat: (props) => [asString(props['label'])],
  TimelineStep: (props) => [
    asString(props['label']),
    asString(props['title']),
    asString(props['description']),
  ],
  VideoEmbed: (props) => [asString(props['caption'])],
};

function proseFieldsFor(block: Block): string[] {
  return PROSE_FIELD_EXTRACTORS[block.type]?.(block.props) ?? [];
}

/** The authoritative "which types does search actually index" list — see `config.spec.ts`'s coverage check. */
export const SEARCHABLE_BLOCK_TYPES = Object.keys(PROSE_FIELD_EXTRACTORS);

/**
 * Every block type NOT in `PROSE_FIELD_EXTRACTORS` above, split by why.
 * `config.spec.ts` checks this list plus `PROSE_FIELD_EXTRACTORS`' keys
 * together account for every real block type with no leftovers — so
 * adding a block and forgetting both fails a real test, not a silent gap.
 */
export const BLOCKS_WITHOUT_SEARCHABLE_TEXT = [
  // Genuinely no prose of their own — pure layout/container/config blocks,
  // or (EmbedHtml) raw markup that would pollute the index rather than
  // read as prose.
  //
  // The three article blocks are here for a different reason: every word
  // they show is filled in from elsewhere on the site (the page's own
  // date, its neighbours, its related pages), so indexing them would file
  // other pages' titles under this one.
  'ArticleMeta',
  'ArticleNav',
  'RelatedPages',
  // A person's name and bio, from their profile: indexing them would file
  // the author's biography under every article they wrote.
  'AuthorBox',
  'Accordion',
  'Column',
  'Columns',
  'Container',
  'EmbedHtml',
  'Form',
  'HamburgerMenu',
  'LanguageSwitcher',
  'Nav',
  'BackToTop',
  'Tabs',
  // ADR-0052/0053/0054's blocks, all genuinely without prose: an
  // arrangement wrapper, a rule, empty space, a picked icon, and two
  // players whose only words are handled below.
  'Carousel',
  'Divider',
  'Spacer',
  'SocialLinks',
  // A hosted video has no words of its own — its poster and its file are
  // not prose. `VideoEmbed` is on this list for the same reason.
  'VideoFile',
  // What it draws is other pages' titles, and those pages are indexed
  // themselves — indexing them again here would make one page answer for
  // words that are not on it (ADR-0064).
  'PageGrid',
  // The names of terms, which the term's own page already answers for:
  // a filter is a way to move through a list, not words this page says.
  'TermList',
  // A point, a bar, and containers: nothing of their own to read.
  'Anchor',
  'ReadingProgress',
  'List',
  'Faq',
  'Marquee',
  // Other pages' titles, indexed on those pages themselves (ADR-0064).
  'SubPages',
  'SiblingPages',
  'SiteMap',
  // The site's own address and phone: Business info, not this page's words.
  'ContactDetails',
  // Containers and arrangements whose words all live in their children,
  // which index themselves.
  'ProductGrid',
  'ProductReviews',
  'RestaurantMenu',
  'EventList',
  'Steps',
  'SpecList',
  'Glossary',
  'VideoPlaylist',
  // Business info again, and a third party's booking page.
  'StickyContactBar',
  'BookingEmbed',
  // Arrangements whose every word belongs to a child that indexes itself —
  // the same reason ProductGrid and EventList are above.
  'FeatureGrid',
  'PricingTable',
  'StatsCounter',
  'Team',
  'Testimonials',
  'Timeline',
  // Furniture, not the page's words: the trail's "Home" and the search
  // field's placeholder read the same on every page that draws them, so
  // indexing them would answer "home" or "cerca" with the whole site.
  'Breadcrumb',
  'SearchBox',
] as const;
