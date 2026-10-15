import { randomUUID } from 'node:crypto';
import {
  BLOCK_PROPS_SCHEMAS,
  isRecord,
  type Block,
  type PageContent,
} from '@kometio/shared-types';
import type { z } from 'zod';
import type { StarterReferenceKind } from './starter';
import { parseReference } from './starter-blocks';

/** The id of everything a starter has made so far, by the key it gave it. */
export type StarterIds = Record<StarterReferenceKind, Map<string, string>>;

export function emptyStarterIds(): StarterIds {
  return {
    page: new Map(),
    form: new Map(),
    taxonomy: new Map(),
    term: new Map(),
  };
}

const SCHEMAS: Readonly<Record<string, z.ZodType>> = BLOCK_PROPS_SCHEMAS;

/** A value with every reference in it replaced by the id it stands for. */
function resolveValue(value: unknown, ids: StarterIds): unknown {
  if (typeof value === 'string') {
    const reference = parseReference(value);
    if (!reference) return value;
    const id = ids[reference.kind].get(reference.key);
    if (id === undefined) {
      // A starter that names what it did not make is a mistake in the starter,
      // which its spec refuses; reaching this is a spec that was not run.
      throw new Error(
        `A starter refers to a ${reference.kind} it does not have: "${reference.key}"`,
      );
    }
    return id;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, ids));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [
        key,
        resolveValue(inner, ids),
      ]),
    );
  }
  return value;
}

/**
 * The props as the editor would have written them: held to the block's own
 * schema, so every default is there, and a block a starter got wrong fails
 * here and not on a visitor's screen.
 */
function materialise(
  type: string,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const schema = Object.hasOwn(SCHEMAS, type) ? SCHEMAS[type] : undefined;
  if (!schema) return props;
  const parsed = schema.parse(props);
  return isRecord(parsed) ? parsed : props;
}

/**
 * Blocks with their references resolved and an id each, ready to be saved.
 * Nothing is shared with the starter's own blocks: a starter is a constant,
 * and what is saved is a copy of it.
 */
export function resolveStarterContent(
  blocks: PageContent,
  ids: StarterIds,
): PageContent {
  return blocks.map((block): Block => {
    const resolved = resolveValue(block.props, ids);
    const props = isRecord(resolved) ? resolved : {};
    return {
      ...block,
      id: randomUUID(),
      props: materialise(block.type, props),
      ...(block.children
        ? { children: resolveStarterContent(block.children, ids) }
        : {}),
    };
  });
}
