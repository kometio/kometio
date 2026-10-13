import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blockSamples } from './block-samples';

const FIXTURE = join(
  import.meta.dirname,
  '../../../../apps/e2e/src/fixtures/block-samples.json',
);

describe('blockSamples', () => {
  it('has a sample for every block the picker offers, and none of a block that only works inside another at the root', () => {
    const { categories } = blockSamples();
    const roots = categories.flatMap((category) =>
      category.blocks.map((block) => block.type),
    );

    expect(roots).toContain('Hero');
    expect(roots).toContain('Tabs');
    expect(roots).not.toContain('Tab');
  });

  it('gives a container a child of a type it takes', () => {
    const tabs = blockSamples()
      .categories.flatMap((category) => category.blocks)
      .find((block) => block.type === 'Tabs');

    expect(tabs?.children?.[0]?.type).toBe('Tab');
  });

  it('is the same on every run: a date a default computes from the day is fixed', () => {
    expect(JSON.stringify(blockSamples())).toBe(JSON.stringify(blockSamples()));
    expect(JSON.stringify(blockSamples())).not.toMatch(
      /"20(?!99)\d\d-\d\d-\d\dT/,
    );
  });

  /*
   * The browser suite reads this file and may not import the registry. When
   * a block is added, or one's defaults change, the file falls behind and the
   * public site's accessibility audit would be of last week's blocks.
   */
  it('is what the fixture of the browser suite says', () => {
    const onDisk = JSON.parse(readFileSync(FIXTURE, 'utf8'));

    expect(
      onDisk,
      'apps/e2e/src/fixtures/block-samples.json is behind the registry: run `pnpm run e2e:block-samples`',
    ).toEqual(blockSamples());
  });
});
