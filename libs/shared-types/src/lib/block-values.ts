import { z } from 'zod';

/**
 * i18n a livello di campo (see the plan) — `pageGroupId` is locale-
 * independent by construction (a group, not one specific translation), on
 * purpose: `locale`/`slug` used to be denormalized here at PICK time, which
 * meant a link picked while editing one language pointed at THAT
 * language's path even when the containing block is shared across every
 * locale of the group (`page` isn't a `translatable` field — real bug,
 * found live: an IT reader could get an EN link). `locale`/`slug` are now
 * `.optional()` — present ONLY on a RESOLVED reference (added by
 * `resolvePageReferences` in page-reference.ts, at publish/preview render
 * time, for the locale actually being rendered), absent on the raw STORED
 * value the editor picker writes. `title` stays denormalized purely for
 * the editor canvas/picker label (same reasoning as PickedForm's
 * `formName`), never used for rendering either way.
 */
export const pickedPageSchema = z.object({
  pageGroupId: z.string(),
  title: z.string(),
  locale: z.string().optional(),
  slug: z.string().optional(),
  /**
   * Filled in at render alongside `locale`/`slug`, never stored by the
   * picker: the page's ancestors in the locale being rendered, root
   * first. Without it a link to a nested page renders as `/it/first-run`
   * — the bare slug — which stopped resolving when slugs became scoped to
   * their siblings (ADR-0029).
   */
  ancestorSlugs: z.array(z.string()).optional(),
});
export type PickedPage = z.infer<typeof pickedPageSchema>;

/**
 * The picked media's `url` is denormalized into the block props (not just
 * `mediaId`) so rendering — both the editor canvas and apps/public-site —
 * never needs a live call back to the media API to resolve an id to a URL.
 * `mediaId` is kept alongside it so the editor's media picker can still
 * highlight "this is the currently selected image" reliably, by id rather
 * than by string-matching a URL. `width`/`height` follow the same
 * reasoning (denormalized at pick-time, not re-resolved at render time) —
 * already measured by sharp at upload (see media.width/height,
 * local-disk-media-storage.adapter.ts/s3-media-storage.adapter.ts),
 * nullable only because media picked before this field existed has none.
 * Public-site's image-bearing blocks render them as real `width`/`height`
 * attributes to prevent layout shift (CLS) — omitted, not defaulted, when
 * absent, since a guessed value would be actively wrong. `.nullish()`, not
 * just `.nullable()`: every page saved before this field existed has
 * Image/Gallery/etc. blocks whose `media` object is missing the key
 * entirely, not holding `null` — a plain `.nullable()` would reject that
 * already-saved content outright the first time it's parsed.
 */
export const pickedMediaSchema = z.object({
  mediaId: z.string(),
  url: z.string(),
  width: z.number().nullish(),
  height: z.number().nullish(),
  /**
   * What a download link says about the file — its name, type and size —
   * captured when it is picked. Absent on every media picked before
   * `FileDownload` existed, and on images, which never show them.
   */
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  size: z.number().optional(),
  /**
   * The file's own alternative text, as the library held it when the file
   * was picked — denormalized like `url` and `width`, so an image with no
   * `alt` of its own can still say something. Empty when the file had none,
   * absent on every file picked before the library could hold one.
   */
  alt: z.string().optional(),
});
export type PickedMedia = z.infer<typeof pickedMediaSchema>;

/**
 * How a collection arranges the items it holds (ADR-0052).
 *
 * The problem it solves is a multiplication. There are ten collection
 * blocks, each with ONE hard-wired arrangement: `Testimonials` is a
 * slider, `Team` is a grid, and wanting the team as a slider meant a new
 * block type. Ten collections times four arrangements is forty nearly
 * identical files, each with its own CSS, RTL handling, accessibility and
 * translations to keep correct.
 *
 * As a value instead, the same combinations cost one engine and three
 * arrangements.
 *
 * `grid`   — every item visible, wrapping onto rows
 * `slider` — one item at a time, scroll-snapped, with prev/next
 * `carousel` — several at a time, scrolling sideways
 *
 * A PROP and not a field of the block, unlike `variant` (ADR-0048) and
 * `align` (ADR-0049). The rule those two follow is "can a theme change
 * the set of legal values?" — a theme may add or drop a variant, so
 * content pointing at one cannot live in props. These three are core's
 * own, implemented in core CSS, and a theme cannot remove one; there is
 * no dangling value to protect against. Being a prop also means the
 * editor re-renders the block on change, which is exactly what switching
 * arrangement needs, with no new plumbing at all.
 */
export const collectionDisplaySchema = z.enum(['grid', 'slider', 'carousel']);
export type CollectionDisplay = z.infer<typeof collectionDisplaySchema>;
