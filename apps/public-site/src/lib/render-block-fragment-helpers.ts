import {
  collectResolvedPageRefs,
  isServerFilledBlockType,
  resolvePageReferences,
  resolveSectionBlocks,
  SERVER_FILLED_PROPS,
  type Block,
  type PageContent,
  type ResponsiveBlockStyle,
} from '@kometio/shared-types';
import { type PublishedPage } from '@kometio/api-contracts';
import { editorAppUrl } from './editor-app-url';
import { findBlockById } from '@kometio/shared-types';

export interface RenderBlockFragmentBody {
  pageId: string;
  /**
   * Set only by the reusable-section editor (docs/adr/0059). When present
   * the token is validated against that SECTION and `pageId` is ignored —
   * a section is not on a page, and the two token kinds are deliberately
   * not interchangeable.
   */
  sectionId?: string;
  /** Which language the fragment's links resolve in — carried only alongside `sectionId`, since a section has no locale of its own. */
  locale?: string;
  token: string;
  blockId: string;
  blockType: string;
  props: Record<string, unknown>;
  /**
   * When present, used directly rather than rebuilt by reading the saved
   * draft server-side (see render-block-fragment.ts) — the caller
   * (canvas-editor-shell.tsx) already knows the current tree, so there is no
   * need to read it back, and above all no race: the draft save and this
   * call start in parallel, and a server read has no guarantee of seeing
   * the save that just happened.
   */
  children?: Block[];
  /** The per-instance override (docs/adr/0022), every breakpoint of it (ADR-0047) — without this, changing ONE block's style from the canvas would not show until the iframe reloaded. */
  styleOverride?: ResponsiveBlockStyle;
  /** `Block.variant` (ADR-0047) — same reason as the override above: without it the fragment comes back without its variant class. */
  variant?: string;
}

/**
 * Isolated from the route itself (render-block-fragment.ts) because that
 * file imports an .astro component — vitest, with this project's plain
 * config (no Astro Vite plugin registered), cannot transform an .astro
 * import in a test file's module graph. That route's end-to-end
 * verification (token, CSS scoping, CORS) was done live against the real
 * dev server rather than here — see the visual editor plan, Day 3.
 */
export function isValidRenderBlockFragmentBody(
  body: unknown,
): body is RenderBlockFragmentBody {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const candidate = body as Record<string, unknown>;
  return (
    typeof candidate['pageId'] === 'string' &&
    (candidate['sectionId'] === undefined ||
      typeof candidate['sectionId'] === 'string') &&
    (candidate['locale'] === undefined ||
      typeof candidate['locale'] === 'string') &&
    typeof candidate['token'] === 'string' &&
    typeof candidate['blockId'] === 'string' &&
    typeof candidate['blockType'] === 'string' &&
    typeof candidate['props'] === 'object' &&
    candidate['props'] !== null &&
    (candidate['children'] === undefined ||
      Array.isArray(candidate['children'])) &&
    (candidate['styleOverride'] === undefined ||
      (typeof candidate['styleOverride'] === 'object' &&
        candidate['styleOverride'] !== null)) &&
    (candidate['variant'] === undefined ||
      typeof candidate['variant'] === 'string')
  );
}

/**
 * The component scripts of a fragment, kept out of what is sent back.
 *
 * Rendered through the Container API, a block's bundled `<script>` has no
 * page to be hoisted into, and Astro writes it out with whatever the
 * container's `resolve` makes of the module id — which, with no `resolve`,
 * is the module id itself: the ABSOLUTE PATH of the component on the
 * server (`/Users/…/apps/public-site/src/components/blocks/Tabs.astro?astro
 * &type=script…`, `/app/…` in a container). Every fragment of a block with
 * a behaviour handed the editor the server's directory layout, and the
 * canvas then asked the site for that path and got a 404.
 *
 * The canvas never needed those tags: a patched or inserted block is wired
 * by `runBlockBehaviorsInSubtree` from BLOCK_BEHAVIOR_REGISTRY, the only
 * thing that ever made its behaviour work. So `resolve` hands Astro a
 * placeholder that names nothing, and `strip` removes the tags written
 * with it — by the exact string Astro emits, not by pattern, so nothing
 * else in the fragment (an author's embed, Turnstile's own `<script src>`)
 * can be touched. Were Astro ever to write the tag differently, what is
 * left is a placeholder, still not a path.
 */
export class FragmentComponentScripts {
  readonly #prefix = `kometio-fragment-script:${crypto.randomUUID()}:`;
  readonly #emitted: string[] = [];

  /** For `AstroContainer.create({ resolve })`. */
  readonly resolve = (_specifier: string): Promise<string> => {
    const placeholder = `${this.#prefix}${this.#emitted.length}`;
    this.#emitted.push(placeholder);
    return Promise.resolve(placeholder);
  };

  strip(html: string): string {
    return this.#emitted.reduce(
      (remaining, placeholder) =>
        remaining
          .split(`<script type="module" src="${placeholder}"></script>`)
          .join(''),
      html,
    );
  }
}

export function renderBlockFragmentCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': editorAppUrl(),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

/**
 * The one block the canvas asked for, as the page would render it.
 *
 * Three things have to be put back that the request cannot carry:
 *
 * - its `children`, when the caller did not pass them (an older call);
 * - the blocks of any reusable section inside it, which live on the server
 *   (docs/adr/0059) — taken from the sections the PAGE uses, which the
 *   preview payload carries. Without this a section pasted, duplicated or
 *   restored by an undo came back saying it had not been published, for a
 *   section plainly published further up the same page. One the page does
 *   not use yet is still unknown here; the editor reloads for that;
 * - its page references, resolved into the locale being rendered, reusing
 *   what the rest of the page already resolved rather than a second round
 *   trip.
 *
 * - the ANSWER of a block the server fills (an article's date, a page
 *   list, an author), taken from the page as the server just resolved it:
 *   the editor holds only the question, and a block re-rendered from that
 *   alone came back empty — the byline vanished the moment an option of
 *   it was switched.
 *
 * Sections first and links after, the same order the page render uses: a
 * section can hold a Link, and that link has to be resolved too.
 */
export function buildFragmentBlock(
  body: RenderBlockFragmentBody,
  page: PublishedPage,
): Block {
  const children =
    body.children ??
    findBlockById(page.content, body.blockId)?.children ??
    findBlockById(page.header ?? [], body.blockId)?.children ??
    findBlockById(page.footer ?? [], body.blockId)?.children;

  const rawBlock: Block = {
    id: body.blockId,
    type: body.blockType,
    props: body.props,
    ...(children ? { children } : {}),
    ...(body.styleOverride ? { styleOverride: body.styleOverride } : {}),
    ...(body.variant ? { variant: body.variant } : {}),
  };

  const answered = withServerAnswers(rawBlock, [
    page.content,
    page.header ?? [],
    page.footer ?? [],
  ]);

  const publishedSections = new Map<string, PageContent>(
    Object.entries(page.sections ?? {}),
  );
  const withSections = resolveSectionBlocks([answered], publishedSections);
  const resolvedRefs = new Map([
    ...collectResolvedPageRefs(page.content),
    ...collectResolvedPageRefs(page.header ?? []),
    ...collectResolvedPageRefs(page.footer ?? []),
  ]);
  // One block in, one block out; the fallback is that block as answered,
  // and is not reached.
  const [block] = resolvePageReferences(withSections, resolvedRefs);
  return block ?? answered;
}

/**
 * This block — and every block inside it — with the answer the server gave
 * for it on the resolved page, where the page has one: the props the editor
 * sent stay as sent (they are the edit), and only the props that ARE the
 * answer (SERVER_FILLED_PROPS) are copied over.
 *
 * A block the resolved page does not have yet — one just inserted — keeps
 * its empty answer; the editor reloads the canvas for those.
 */
function withServerAnswers(block: Block, resolvedTrees: PageContent[]): Block {
  const children = block.children?.map((child) =>
    withServerAnswers(child, resolvedTrees),
  );
  const withChildren = children ? { ...block, children } : block;
  if (!block.id || !isServerFilledBlockType(block.type)) {
    return withChildren;
  }
  const blockId = block.id;
  const resolved = resolvedTrees
    .map((tree) => findBlockById(tree, blockId))
    .find((found) => found?.type === block.type);
  if (!resolved) {
    return withChildren;
  }
  const answer = Object.fromEntries(
    SERVER_FILLED_PROPS[block.type]
      .filter((key) => key in resolved.props)
      .map((key) => [key, resolved.props[key]]),
  );
  return { ...withChildren, props: { ...block.props, ...answer } };
}
