import type { Block } from './content-model';

/**
 * Every block of a tree, each before its children, in page order. The one
 * walk every "find the block" and "collect from every block" in the
 * editor, the public site and here is written on: it used to be written
 * out a dozen times, and two copies of "the blocks inside this one" had
 * already drifted apart. A generator, so a search stops at what it finds.
 */
export function* eachBlock(blocks: readonly Block[]): Generator<Block> {
  for (const block of blocks) {
    yield block;
    if (block.children) yield* eachBlock(block.children);
  }
}

/** The block with this id, at any depth, or null. */
export function findBlockById(
  blocks: readonly Block[],
  id: string,
): Block | null {
  for (const block of eachBlock(blocks)) {
    if (block.id === id) return block;
  }
  return null;
}

/**
 * The ids of a block and of everything inside it — what a block cannot be
 * moved into. Empty when no block has this id.
 */
export function subtreeIds(blocks: readonly Block[], id: string): Set<string> {
  const root = findBlockById(blocks, id);
  const ids = new Set<string>();
  if (!root) return ids;
  for (const block of eachBlock([root])) {
    if (block.id) ids.add(block.id);
  }
  return ids;
}
