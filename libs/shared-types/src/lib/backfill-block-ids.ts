import type { Block } from './content-model';

// Web Crypto (`globalThis.crypto`), not `node:crypto` — this file is
// exported from @kometio/shared-types' barrel, which apps/public-site also
// imports from client-side scripts (preview-bridge-client.ts): a
// `node:crypto` import would be externalized by Vite for the browser bundle
// and would throw as soon as the barrel is evaluated, even when this
// particular function is never called there. `crypto.randomUUID()` is the
// same standard Web Crypto API in both Node (global since v19) and the
// browser.
const randomUUID = (): string => crypto.randomUUID();

/**
 * Assigns a stable id to every block that lacks one, recursively through
 * `children` — never to a block that already has one (idempotent: a second
 * pass over already-backfilled content changes nothing). It does not mutate
 * the input array or objects: it builds new trees only for the branches
 * actually touched, so a caller can check `changed` to decide whether
 * writing the row is worthwhile.
 *
 * Why not lazy regeneration on every load: an id that changes until someone
 * saves is fragile for exactly dragging, selection and fragment patching,
 * which will use it as a stable identity — see the editor plan, Day 1.
 */
export function backfillBlockIds(blocks: Block[]): {
  content: Block[];
  changed: boolean;
} {
  let changed = false;

  const content = blocks.map((block) => {
    const needsId = !block.id;
    const childResult = block.children
      ? backfillBlockIds(block.children)
      : null;

    if (!needsId && !childResult?.changed) {
      return block;
    }

    changed = true;
    return {
      ...block,
      id: block.id ?? randomUUID(),
      ...(childResult ? { children: childResult.content } : {}),
    };
  });

  return { content, changed };
}
