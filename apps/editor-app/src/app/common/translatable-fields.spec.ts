import { describe, expect, it } from 'vitest';
import { pageBlocks } from '@kometio/block-registry';
import { translatableFieldsOf } from './translatable-fields';

describe('translatableFieldsOf', () => {
  const translatableFields = translatableFieldsOf(pageBlocks);

  it("names the fields a block's language translates", () => {
    expect(translatableFields('Hero')).toContain('title');
    expect(translatableFields('Text')).toEqual(['body']);
  });

  it('leaves out the fields every language shares', () => {
    expect(translatableFields('Image')).toEqual(
      expect.arrayContaining(['alt', 'caption']),
    );
    expect(translatableFields('Image')).not.toContain('alignment');
    expect(translatableFields('Image')).not.toContain('isDecorative');
  });

  it('is nothing for a type the registry does not know', () => {
    expect(translatableFields('NoSuchBlock')).toEqual([]);
  });
});
