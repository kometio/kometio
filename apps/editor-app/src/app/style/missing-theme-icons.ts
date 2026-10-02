import { isFieldVisible, type BlockDescriptor } from '@kometio/block-registry';
import { iconSource, type Block } from '@kometio/shared-types';

/**
 * Whether the active theme lacks an icon a block stores (ADR-0090).
 *
 * `available` is the theme's interface set, by name, or `undefined` while
 * it is still loading — and then nothing is missing: a warning that flashes
 * on every page while a request is in flight is one people learn to ignore.
 * A logo or a media-library image is never missing, since neither comes
 * from the theme.
 */
export function isIconMissingFromTheme(
  value: string,
  available: Pick<ReadonlySet<string>, 'has'> | undefined,
): boolean {
  return (
    available !== undefined &&
    iconSource(value) === 'interface' &&
    !available.has(value)
  );
}

/**
 * The icons each block stores that the active theme does not have, by
 * block id, at every depth: a Feature inside a FeatureGrid, a NavLink
 * inside a Nav.
 */
export function findMissingThemeIcons(
  blocks: readonly Block[],
  descriptors: readonly BlockDescriptor[],
  isMissing: (value: string) => boolean,
): ReadonlyMap<string, readonly string[]> {
  const descriptorByType = byType(descriptors);
  const found = new Map<string, string[]>();
  const walk = (list: readonly Block[]): void => {
    for (const block of list) {
      const descriptor = descriptorByType.get(block.type);
      if (block.id && descriptor) {
        const missing = shownIconKeys(descriptor, block.props)
          .map((key) => block.props[key])
          .filter(
            (value): value is string =>
              typeof value === 'string' && value !== '' && isMissing(value),
          );
        if (missing.length > 0) {
          found.set(block.id, missing);
        }
      }
      if (block.children) {
        walk(block.children);
      }
    }
  };
  walk(blocks);
  return found;
}

/**
 * The same blocks with every icon the active theme lacks taken out, by the
 * same rule as above — for blocks arriving from outside the editor (a
 * generated page), where a name the theme does not draw is a mistake to
 * drop, not a choice to flag.
 */
export function withoutMissingThemeIcons(
  blocks: readonly Block[],
  descriptors: readonly BlockDescriptor[],
  isMissing: (value: string) => boolean,
): Block[] {
  const descriptorByType = byType(descriptors);
  const clean = (block: Block): Block => {
    const descriptor = descriptorByType.get(block.type);
    const props = { ...block.props };
    for (const key of descriptor ? shownIconKeys(descriptor, props) : []) {
      const value = props[key];
      // Left out, not set to null: the block's own default applies, and a
      // List's icon may not be null at all.
      if (typeof value === 'string' && value !== '' && isMissing(value)) {
        delete props[key];
      }
    }
    return {
      ...block,
      props,
      ...(block.children ? { children: block.children.map(clean) } : {}),
    };
  };
  return blocks.map(clean);
}

function byType(
  descriptors: readonly BlockDescriptor[],
): ReadonlyMap<string, BlockDescriptor> {
  return new Map(
    descriptors.map((descriptor) => [descriptor.type, descriptor]),
  );
}

/**
 * The keys of a block's icon fields that are shown — every icon field,
 * core or theme, whatever its key, but only by the rule the inspector
 * uses: a List whose marker is not an icon still holds an `icon` prop, and
 * draws nothing with it.
 */
function shownIconKeys(
  descriptor: BlockDescriptor,
  props: Block['props'],
): string[] {
  return descriptor.fields
    .filter(
      (field) =>
        field.kind === 'custom' &&
        field.control === 'icon' &&
        isFieldVisible(field, props),
    )
    .map((field) => field.key);
}
