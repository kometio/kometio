import { describe, expect, it } from 'vitest';
import { pageBlocks } from './config';
import { headerFooterBlocks } from './layout-config';

describe('headerFooterBlocks', () => {
  it('offers each type once', () => {
    // Not a fixed count: the palette grows, and a number here would only
    // ever be a reminder to update the number. Uniqueness is the property
    // that actually matters — a type listed twice appears twice in the
    // picker and resolves ambiguously.
    expect(headerFooterBlocks.length).toBeGreaterThan(10);
    const types = headerFooterBlocks.map((block) => block.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('shares one descriptor per type with the page palette, never a copy', () => {
    // ADR-0056 put the layout blocks in both palettes. Two descriptors
    // for one type would drift: a field added to the page's Button would
    // silently not exist in the header's.
    for (const layoutBlock of headerFooterBlocks) {
      const pageVersion = pageBlocks.find(
        (block) => block.type === layoutBlock.type,
      );
      if (pageVersion) {
        expect(pageVersion).toBe(layoutBlock);
      }
    }
  });

  it('reuses the exact same Text/Image/SearchBox descriptors as the page palette — no duplication', () => {
    const shared = ['Text', 'Image', 'SearchBox'];
    for (const type of shared) {
      const pageVersion = pageBlocks.find((block) => block.type === type);
      const layoutVersion = headerFooterBlocks.find(
        (block) => block.type === type,
      );
      expect(layoutVersion).toBe(pageVersion);
    }
  });

  it('has 8 blocks exclusive to header/footer, absent from the page palette', () => {
    const pageTypes = new Set(pageBlocks.map((block) => block.type));
    const exclusive = headerFooterBlocks.filter(
      (block) => !pageTypes.has(block.type),
    );
    expect(exclusive).toHaveLength(8);
  });
});
