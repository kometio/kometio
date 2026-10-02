import type { z } from 'zod';
import type { BlockDescriptor, FieldDescriptor } from './field-types';

/**
 * Same shape as `BlockDescriptor`, minus `defaultProps`/`stylableProperties`/
 * `defaultStyle` (still present below, just re-declared so `schema` can sit
 * next to them) — `schema` is the one addition: the single source of truth
 * `defaultProps`'s type and runtime validity are checked against, instead of
 * a block author hand-writing a type that can silently drift from it.
 */
export interface DefineBlockConfig<Schema extends z.ZodType> {
  type: string;
  label: string;
  category: string;
  /** See `BlockDescriptor.icon` — a lucide name, so a theme's block can declare one too. */
  icon?: string;
  schema: Schema;
  defaultProps: z.infer<Schema>;
  fields: FieldDescriptor[];
  isContainer?: boolean;
  allowedChildTypes?: string[];
  stylableProperties?: BlockDescriptor['stylableProperties'];
  defaultStyle?: BlockDescriptor['defaultStyle'];
}

/**
 * Validated factory for a `BlockDescriptor` — the same object shape every
 * first-party block in `libs/block-registry/src/lib/blocks/*.block.ts`
 * already returns as a plain object literal. `defineBlock()` isn't a
 * separate/parallel mechanism from those; it's a thin, schema-checked way to
 * build the exact same thing, available to third-party block authors who
 * don't have `libs/block-registry`'s internal blocks as copy-paste
 * precedent sitting right next to them.
 *
 * `schema` is consumed here only to `parse()` `defaultProps` at module-load
 * time — a typo'd or missing default fails immediately and loudly, not
 * silently at first render. The schema itself is NOT stored on the returned
 * `BlockDescriptor` (that type has no such field): a theme's `.block.ts`
 * exports it beside the descriptor as `schema`, and the site's loader pairs
 * it with the theme's `.astro` of the same name. See libs/block-sdk/README.md
 * for the full registration walk-through.
 */
export function defineBlock<Schema extends z.ZodType>(
  config: DefineBlockConfig<Schema>,
): BlockDescriptor<z.infer<Schema>> {
  const { schema, ...descriptor } = config;
  schema.parse(descriptor.defaultProps);
  return descriptor;
}
