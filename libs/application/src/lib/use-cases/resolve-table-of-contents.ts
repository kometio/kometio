import type {
  Block,
  PageContent,
  TableOfContentsEntry,
} from '@kometio/shared-types';
import { slugify } from '@kometio/shared-types';

function containsTableOfContents(blocks: PageContent): boolean {
  return blocks.some(
    (block) =>
      block.type === 'TableOfContents' ||
      (block.children ? containsTableOfContents(block.children) : false),
  );
}

/** Every Anchor name on the page, so a heading never takes an id somebody already chose by hand. */
function collectAnchorNames(blocks: PageContent, into: Set<string>): void {
  for (const block of blocks) {
    if (block.type === 'Anchor') {
      const name = slugify(String(block.props['name'] ?? ''));
      if (name) into.add(name);
    }
    if (block.children) collectAnchorNames(block.children, into);
  }
}

/**
 * Gives every h2 and h3 on a page an `anchorId`, and fills each
 * `TableOfContents` with links to them.
 *
 * Only on a page that has a table of contents: everywhere else the
 * headings render as they always did. Ids come from the heading's own
 * words — `#prices`, not `#h-3f2a` — because they end up in links people
 * share; two headings with the same words get `-2`, `-3`.
 *
 * In document order, containers included: a heading inside a column or a
 * reusable section is still a heading of the page, and sections are
 * expanded before this runs.
 */
export function resolveTableOfContents(contents: PageContent[]): PageContent[] {
  return contents.map((content) => {
    if (!containsTableOfContents(content)) return content;

    const taken = new Set<string>();
    collectAnchorNames(content, taken);
    const entries: TableOfContentsEntry[] = [];

    const withAnchors = assignAnchors(content, taken, entries);
    return fillTables(withAnchors, entries);
  });
}

function uniqueId(text: string, taken: Set<string>): string {
  const base = slugify(text) || 'section';
  let candidate = base;
  for (let n = 2; taken.has(candidate); n += 1) {
    candidate = `${base}-${n}`;
  }
  taken.add(candidate);
  return candidate;
}

function assignAnchors(
  blocks: PageContent,
  taken: Set<string>,
  entries: TableOfContentsEntry[],
): PageContent {
  return blocks.map((block) => {
    let next: Block = block;
    const level = block.props['level'];
    const text = String(block.props['text'] ?? '').trim();
    if (
      block.type === 'Heading' &&
      (level === 'h2' || level === 'h3') &&
      text
    ) {
      const anchorId = uniqueId(text, taken);
      entries.push({ anchorId, text, level });
      next = { ...block, props: { ...block.props, anchorId } };
    }
    return block.children
      ? { ...next, children: assignAnchors(block.children, taken, entries) }
      : next;
  });
}

function fillTables(
  blocks: PageContent,
  entries: TableOfContentsEntry[],
): PageContent {
  return blocks.map((block) => {
    const children = block.children
      ? fillTables(block.children, entries)
      : undefined;
    if (block.type !== 'TableOfContents') {
      return children ? { ...block, children } : block;
    }
    // Per block, not once: two tables on one page may ask for different
    // depths.
    const deepest = block.props['depth'] === 'h2' ? 'h2' : 'h3';
    const visible = entries.filter(
      (entry) => deepest === 'h3' || entry.level === 'h2',
    );
    const next: Block = {
      ...block,
      props: { ...block.props, entries: visible },
    };
    return children ? { ...next, children } : next;
  });
}
