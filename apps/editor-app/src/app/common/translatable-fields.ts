import type { BlockDescriptor } from '@kometio/block-registry';

/**
 * The fields of each block type a language translates rather than
 * shares, as `relinkedOverlay` asks for them — read from the registry the
 * canvas uses, theme blocks included. The API cannot answer this for a
 * theme's blocks, which is why relinking computes its overlay here.
 */
export function translatableFieldsOf(
  registry: readonly BlockDescriptor[],
): (blockType: string) => readonly string[] {
  const byType = new Map(
    registry.map((descriptor) => [
      descriptor.type,
      descriptor.fields
        .filter((field) => 'translatable' in field && field.translatable)
        .map((field) => field.key),
    ]),
  );
  return (blockType) => byType.get(blockType) ?? [];
}
