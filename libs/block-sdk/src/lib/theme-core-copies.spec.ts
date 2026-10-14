import { describe, expect, it } from 'vitest';
import {
  checkOverridesTrackCore,
  coreCopiesManifestFor,
  fingerprintOf,
} from './theme-core-copies';

const core = { Button: '<a class="kometio-button">core</a>', Hero: '<h1/>' };
const theirs = { Button: '<a>mine</a>', StatusBadge: '<b/>' };

describe('fingerprintOf', () => {
  it('is the same for the same text and changes with a character', () => {
    expect(fingerprintOf(core.Button)).toBe(fingerprintOf(core.Button));
    expect(fingerprintOf(core.Button)).not.toBe(
      fingerprintOf(`${core.Button} `.replace(' ', '!')),
    );
    expect(fingerprintOf(core.Button)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('does not change with line endings or the blank lines at the end', () => {
    expect(fingerprintOf('a\r\nb\r\n')).toBe(fingerprintOf('a\nb'));
  });
});

describe('checkOverridesTrackCore', () => {
  it('has nothing to say when every replacement was compared with core as it is', () => {
    const manifest = coreCopiesManifestFor(theirs, core);

    expect(checkOverridesTrackCore(theirs, core, manifest)).toEqual([]);
  });

  it('names a replacement of a core block that has no record', () => {
    expect(checkOverridesTrackCore(theirs, core, {})).toEqual([
      expect.objectContaining({
        blockType: 'Button',
        message: expect.stringContaining('does not say which version'),
      }),
    ]);
  });

  it('names a replacement whose core has changed since', () => {
    const manifest = coreCopiesManifestFor(theirs, core);
    const moved = { ...core, Button: `${core.Button}<span>new prop</span>` };

    expect(checkOverridesTrackCore(theirs, moved, manifest)).toEqual([
      expect.objectContaining({
        blockType: 'Button',
        message: expect.stringContaining('has changed since this copy'),
      }),
    ]);
  });

  it('does not take a block of the theme’s own for a copy of anything', () => {
    // StatusBadge is not in core: it needs no entry, and an entry is stale.
    expect(
      checkOverridesTrackCore(theirs, core, {
        ...coreCopiesManifestFor(theirs, core),
        StatusBadge: 'whatever',
      }),
    ).toEqual([
      expect.objectContaining({
        blockType: 'StatusBadge',
        message: expect.stringContaining('no longer replaces'),
      }),
    ]);
  });

  it('names an entry whose replacement is gone', () => {
    const manifest = { ...coreCopiesManifestFor(theirs, core), Hero: 'x' };

    expect(checkOverridesTrackCore(theirs, core, manifest)).toEqual([
      expect.objectContaining({ blockType: 'Hero' }),
    ]);
  });
});

describe('coreCopiesManifestFor', () => {
  it('lists the replacements of core blocks, sorted, and only those', () => {
    expect(Object.keys(coreCopiesManifestFor(theirs, core))).toEqual([
      'Button',
    ]);
  });
});
