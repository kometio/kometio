import type { Block, PageContent } from './content-model';
import { pickedPageSchema } from './content-model';
import { localePathFromAncestors } from '@kometio/theme-runtime';
import {
  collectRichTextPageReferences,
  pageLinkResolverFor,
  resolveRichTextPageLinks,
} from './rich-text-page-links';
import { eachBlock } from './block-tree';

/** groupId -> where that group resolves for one specific rendering locale. */
export type PageGroupSlugMap = Map<
  string,
  { locale: string; slug: string; ancestorSlugs: string[] }
>;

function isPageRefLike(value: unknown): value is { pageGroupId: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'pageGroupId' in value &&
    typeof (value as { pageGroupId: unknown }).pageGroupId === 'string'
  );
}

/**
 * Walks a tree collecting every `pageGroupId` a `page` prop references
 * (Link/NavLink/Button/Banner/PromoBar/PricingPlan all share the same
 * `page` field key via ctaLinkFields(), see link-type-field.ts) — the
 * caller fetches a (locale, slug) for exactly these ids before calling
 * `resolvePageReferences`: pre-fetch a map, then a pure walk.
 */
export function collectPageGroupReferences(content: PageContent): Set<string> {
  const ids = new Set<string>();
  for (const block of eachBlock(content)) {
    const page = block.props['page'];
    if (isPageRefLike(page)) {
      ids.add(page.pageGroupId);
    }
    // A link written INSIDE a sentence (ADR-0046) has no prop of its
    // own — it lives in the rich text as `kometio://page/<id>`. Every
    // string prop is scanned rather than only the ones a registry would
    // call rich text: the reference is an opaque token that cannot
    // occur by accident, and this file has no registry to ask.
    for (const value of Object.values(block.props)) {
      if (typeof value === 'string') {
        for (const id of collectRichTextPageReferences(value)) {
          ids.add(id);
        }
      }
    }
  }
  return ids;
}

/**
 * The reverse of `collectPageGroupReferences` — walks a tree that's
 * ALREADY been through `resolvePageReferences` and harvests its resolved
 * (pageGroupId -> locale/slug) pairs. Used by apps/public-site's
 * render-block-fragment.ts: the single block it live-previews is built
 * fresh from the editor's raw (unresolved) props on every edit, but the
 * REST of the page it already fetched (via getPreviewPageById) is already
 * resolved — reusing those pairs here means an edit to some OTHER prop on
 * a Link/NavLink/etc. block doesn't need a second round-trip just to keep
 * showing that block's own already-known destination.
 */
export function collectResolvedPageRefs(
  content: PageContent,
): PageGroupSlugMap {
  const map: PageGroupSlugMap = new Map();
  for (const block of eachBlock(content)) {
    const parsed = pickedPageSchema.safeParse(block.props['page']);
    if (parsed.success && parsed.data.locale && parsed.data.slug) {
      map.set(parsed.data.pageGroupId, {
        locale: parsed.data.locale,
        slug: parsed.data.slug,
        ancestorSlugs: parsed.data.ancestorSlugs ?? [],
      });
    }
  }
  return map;
}

function resolveBlock(block: Block, slugByGroupId: PageGroupSlugMap): Block {
  const children = block.children?.map((child) =>
    resolveBlock(child, slugByGroupId),
  );
  const props = resolveProps(block.props, slugByGroupId);
  if (props === block.props && children === block.children) {
    return block;
  }
  return { ...block, props, ...(children ? { children } : {}) };
}

function resolveProps(
  props: Record<string, unknown>,
  slugByGroupId: PageGroupSlugMap,
): Record<string, unknown> {
  const resolveHref = pageLinkResolverFor(
    slugByGroupId,
    localePathFromAncestors,
  );
  let next = props;
  for (const [key, value] of Object.entries(props)) {
    if (typeof value !== 'string') {
      continue;
    }
    // Links written inside a sentence, resolved with the same function
    // the rest of the site builds addresses with — including the ancestor
    // chain, so a link in a paragraph lands exactly where the Link
    // block's would rather than on a bare slug that 404s.
    const resolved = resolveRichTextPageLinks(value, resolveHref);
    if (resolved !== value) {
      next = next === props ? { ...props } : next;
      next[key] = resolved;
    }
  }

  const page = props['page'];
  if (!isPageRefLike(page)) {
    return next;
  }
  const resolved = slugByGroupId.get(page.pageGroupId);
  next = next === props ? { ...props } : next;
  // `null`, not a dangling ref, when the group has no translation in
  // this locale (deleted, or never translated) — same "nothing to link
  // to" state a field that was never picked at all already renders as
  // (Link.astro's own `linkType === 'page' && page` guard).
  next['page'] = resolved ? { ...page, ...resolved } : null;
  return next;
}

/**
 * Rewrites every `page` reference in a tree from its stored, locale-
 * independent form (`{pageGroupId, title}`) to the resolved form
 * apps/public-site's block components read (`{pageGroupId, title, locale,
 * slug}`) — for the ONE locale `slugByGroupId` was built for. Pure,
 * synchronous: the caller has already fetched every referenced group's
 * translation for that locale (see collectPageGroupReferences).
 */
export function resolvePageReferences(
  content: PageContent,
  slugByGroupId: PageGroupSlugMap,
): PageContent {
  return content.map((block) => resolveBlock(block, slugByGroupId));
}
