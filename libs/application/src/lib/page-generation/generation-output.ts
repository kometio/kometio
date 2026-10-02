import { z } from 'zod';
import { BLOCK_PROPS_SCHEMAS } from '@kometio/shared-types';
import {
  GENERATION_CATALOG,
  isGenerableType,
  type GenerableType,
} from './generation-catalog';

/*
 * What the model returns: a FLAT list of blocks, each naming its parent by
 * a reference of the model's own choosing, not the nested tree the page
 * stores. Structured output cannot describe a recursive schema, and a
 * tree's `children` is one; a flat list is also easier for a smaller local
 * model to keep valid. The server puts the tree back together
 * (assemble-generated-page.ts), checking every link as it goes.
 */

/**
 * The props of one block as the model sees them: only the ones it writes,
 * taken from the block's real schema so the two cannot disagree.
 *
 * Strict for the schema the model is given — structured output needs
 * `additionalProperties: false` — and lenient when an answer is read: a
 * local model without structured output that adds a stray key should cost
 * that key, not the block. Whatever it added is overwritten by the
 * server's own props anyway.
 */
function projection(type: GenerableType, strict: boolean) {
  const writes: readonly string[] = GENERATION_CATALOG[type].writes;
  const shape = Object.fromEntries(
    Object.entries(BLOCK_PROPS_SCHEMAS[type].shape).filter(([key]) =>
      writes.includes(key),
    ),
  );
  return strict ? z.strictObject(shape) : z.object(shape);
}

function generatedBlockSchema(type: GenerableType, strict: boolean) {
  const object = strict ? z.strictObject : z.object;
  return object({
    /** The model's own name for this block, for its children to point at. */
    ref: z.string(),
    /** The `ref` of the block it sits in, or null at the top of the page. */
    parent: z.string().nullable(),
    type: z.literal(type),
    props: projection(type, strict),
  });
}

const GENERABLE_TYPES = Object.keys(GENERATION_CATALOG).filter(isGenerableType);

/** One lenient schema per block type, to read each generated block on its own. */
export const GENERATED_BLOCK_SCHEMAS: ReadonlyMap<
  GenerableType,
  ReturnType<typeof generatedBlockSchema>
> = new Map(
  GENERABLE_TYPES.map((type) => [type, generatedBlockSchema(type, false)]),
);

/** The whole answer, as the model is asked to give it. */
export const generatedPageSchema = z.strictObject({
  blocks: z.array(
    z.union(GENERABLE_TYPES.map((type) => generatedBlockSchema(type, true))),
  ),
});

/**
 * The JSON Schema handed to the model's structured output. Constraints it
 * cannot express (a minimum, a maximum length) are checked again on the
 * server against the block's real schema, so nothing depends on them here.
 */
export function generatedPageJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(generatedPageSchema, { io: 'input' });
}
