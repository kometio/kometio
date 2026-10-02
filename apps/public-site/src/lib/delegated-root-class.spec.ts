import { describe, expect, it } from 'vitest';
import { delegatedRootClass } from './delegated-root-class';

describe('delegatedRootClass', () => {
  it('puts the type class before the instance class', () => {
    expect(delegatedRootClass('kometio-buy-button', 'kometio-b-1')).toBe(
      'kometio-buy-button kometio-b-1',
    );
  });

  it('is the type class alone for a block with no style of its own', () => {
    expect(delegatedRootClass('kometio-map-embed', null)).toBe(
      'kometio-map-embed',
    );
    expect(delegatedRootClass('kometio-map-embed', undefined)).toBe(
      'kometio-map-embed',
    );
  });
});
