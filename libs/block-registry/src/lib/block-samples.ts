import { pageBlockCategories, pageBlocks } from './config';

/** A block with its default props and, for a container, the children that make a sample of it. */
export interface BlockSample {
  type: string;
  props: Record<string, unknown>;
  children?: BlockSample[];
}

export interface BlockSampleCategory {
  category: string;
  blocks: BlockSample[];
}

const byType = new Map(pageBlocks.map((block) => [block.type, block]));

/** A block with its defaults and, for a container, one child of a type it takes (and one level under that). */
function sampleOf(type: string, depth = 0): BlockSample {
  const block = byType.get(type);
  if (!block) throw new Error(`no such block in the registry: ${type}`);
  const sample: BlockSample = {
    type,
    props: structuredClone(block.defaultProps),
  };
  if (block.isContainer && depth < 2) {
    const childType =
      block.allowedChildTypes?.find((candidate) => byType.has(candidate)) ??
      'Text';
    sample.children = [sampleOf(childType, depth + 1)];
  }
  return sample;
}

/**
 * A few defaults are computed from the day (a Countdown ends a month from
 * now): left as they are, the fixture made from these would be different
 * every minute and a check against it could never pass. A date in a default
 * is a date far enough away to still be in the future.
 */
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?Z?)?$/;
function withStableDates(value: unknown): unknown {
  if (typeof value === 'string') {
    return DATE_TIME.test(value) ? '2099-12-31T00:00' : value;
  }
  if (Array.isArray(value)) return value.map(withStableDates);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [
        key,
        withStableDates(inner),
      ]),
    );
  }
  return value;
}

/**
 * One sample of every block the page picker offers, grouped by the picker's
 * own categories: what the browser suite's public-site accessibility audit
 * puts on pages and visits (apps/e2e, `fixtures/block-samples.json`).
 *
 * A block that only works inside another (`allowedParentTypes`) is a child of
 * it in the sample, not a root of its own.
 */
export function blockSamples(): { categories: BlockSampleCategory[] } {
  const categories = pageBlockCategories
    .map((category) => ({
      category: category.title.replace(/^blocks\.categories\./, ''),
      blocks: category.types
        .filter((type) => !byType.get(type)?.allowedParentTypes?.length)
        .map((type) => sampleOf(type)),
    }))
    .filter((category) => category.blocks.length > 0);
  // The dates are normalised after the whole sample is made, so that a nested
  // default is covered too. JSON-shaped by construction.
  return withStableDates({ categories }) as {
    categories: BlockSampleCategory[];
  };
}
