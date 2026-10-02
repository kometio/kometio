import { describe, expect, it } from 'vitest';
import type { BlockDescriptor } from '@kometio/block-sdk';
import { pageBlocks } from './config';
import { headerFooterBlocks } from './layout-config';

/**
 * Where a block may sit is declared from both ends: a container lists what
 * it takes (`allowedChildTypes`), a child lists where it belongs
 * (`allowedParentTypes`). A child naming a parent that would refuse it — or
 * a parent that is not there — is a block nobody can ever insert, and
 * nothing at runtime would say why.
 */
describe.each([
  ['page', pageBlocks],
  ['header and footer', headerFooterBlocks],
] as const)('placement rules of the %s registry', (_name, registry) => {
  const byType = new Map<string, BlockDescriptor>(
    registry.map((descriptor) => [descriptor.type, descriptor]),
  );

  it('names only parents that exist, are containers and take the child', () => {
    const problems = registry.flatMap((child) =>
      (child.allowedParentTypes ?? []).flatMap((parentType) => {
        const parent = byType.get(parentType);
        if (!parent) {
          return [`${child.type}: parent ${parentType} is not registered`];
        }
        if (!parent.isContainer) {
          return [`${child.type}: parent ${parentType} is not a container`];
        }
        if (
          parent.allowedChildTypes &&
          !parent.allowedChildTypes.includes(child.type)
        ) {
          return [`${child.type}: ${parentType} does not list it as a child`];
        }
        return [];
      }),
    );

    expect(problems).toEqual([]);
  });
});

describe('blocks that only work inside their parent', () => {
  it('are exactly the ones that break outside it', () => {
    const declared = Object.fromEntries(
      pageBlocks
        .filter((descriptor) => descriptor.allowedParentTypes)
        .map((descriptor) => [descriptor.type, descriptor.allowedParentTypes]),
    );

    // Checked by rendering each child at the page root (2026-09-11): a Tab
    // has no tab to reach it, a Column is a box with no grid, a timeline
    // step's marker hangs outside the content column. A list item outside a
    // list is an <li> with no <ul> around it — markup that is not valid, and
    // that a screen reader does not announce as a list at all. The others
    // render as cards of their own and stay free on purpose.
    //
    // The same test for the last family (2026-09-13): a comparison row is
    // cells with no columns to line up with, a step is an <li> with no
    // list to count it, a spec item and a glossary term are a <dt>/<dd>
    // pair with no <dl>, and a hotspot is a percentage of a picture that
    // is not there. Product cards, reviews, menu items and events are
    // cards of their own and stay free.
    expect(declared).toEqual({
      Column: ['Columns'],
      ComparisonRow: ['ComparisonTable'],
      GlossaryTerm: ['Glossary'],
      Hotspot: ['ImageHotspots'],
      ListItem: ['List'],
      SpecItem: ['SpecList'],
      Step: ['Steps'],
      Tab: ['Tabs'],
      TimelineStep: ['Timeline'],
    });
  });
});
