import type { BlockDescriptor } from '@kometio/block-registry';
import type { InvalidBlockProps } from '@kometio/shared-types';

/** How many names the question carries: it is a sentence, and the canvas marks the rest where they are. */
const MAX_NAMES = 4;

/**
 * What the publish question calls the blocks the site would leave out: each
 * by the name it is picked by and, in brackets, the props at fault by the
 * label their field has in the inspector, so that "Image (Media)" is where to
 * look and nothing says "Invalid input". The same block name twice is one name
 * and a count; a type nobody described, or a field nobody labelled, is called
 * by its key, as Layers does.
 */
export function skippedBlockNames(
  skipped: readonly InvalidBlockProps[],
  registry: readonly BlockDescriptor[],
  tLabel: (key: string) => string,
): string {
  const counts = new Map<string, number>();
  for (const block of skipped) {
    const descriptor = registry.find((entry) => entry.type === block.type);
    const typeName = descriptor ? tLabel(descriptor.label) : block.type;
    const fieldNames = block.fields.map((key) => {
      const field = descriptor?.fields.find((entry) => entry.key === key);
      return field ? tLabel(field.label) : key;
    });
    const name =
      fieldNames.length > 0
        ? `${typeName} (${fieldNames.join(', ')})`
        : typeName;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const named = [...counts].map(([name, count]) =>
    count > 1 ? `${name} ×${count}` : name,
  );
  return named.length > MAX_NAMES
    ? `${named.slice(0, MAX_NAMES).join(', ')}…`
    : named.join(', ');
}
