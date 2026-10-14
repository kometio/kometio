import { describe, expect, it } from 'vitest';
import type { BlockDescriptor } from '@kometio/block-registry';
import type { InvalidBlockProps } from '@kometio/shared-types';
import { skippedBlockNames } from './skipped-block-names';

const image: BlockDescriptor = {
  type: 'Image',
  label: 'blocks.image.label',
  category: 'media',
  defaultProps: {},
  fields: [
    { kind: 'text', key: 'caption', label: 'blocks.image.caption' },
    { kind: 'text', key: 'media', label: 'blocks.image.media' },
  ],
};

const names: Record<string, string> = {
  'blocks.image.label': 'Immagine',
  'blocks.image.media': 'File',
};
const tLabel = (key: string) => names[key] ?? key;

const refused = (
  type: string,
  fields: string[],
  position = 1,
): InvalidBlockProps => ({
  id: `b${position}`,
  type,
  position,
  issues: fields.map((field) => `${field}: Invalid input`),
  fields,
});

describe('skippedBlockNames', () => {
  it('calls a block by the name it is picked by and the prop by its label', () => {
    expect(
      skippedBlockNames([refused('Image', ['media'])], [image], tLabel),
    ).toBe('Immagine (File)');
  });

  it('falls back to the key for a type or a prop nobody described, as Layers does', () => {
    expect(
      skippedBlockNames(
        [refused('Image', ['alt']), refused('StatusBadge', ['tone'], 2)],
        [image],
        tLabel,
      ),
    ).toBe('Immagine (alt), StatusBadge (tone)');
  });

  it('says only the name when no prop is at fault', () => {
    expect(skippedBlockNames([refused('Image', [])], [image], tLabel)).toBe(
      'Immagine',
    );
  });

  it('counts a name that comes twice instead of repeating it', () => {
    expect(
      skippedBlockNames(
        [
          refused('Image', ['media'], 1),
          refused('Image', ['media'], 2),
          refused('Image', ['media'], 3),
        ],
        [image],
        tLabel,
      ),
    ).toBe('Immagine (File) ×3');
  });

  it('names four and then says there are more', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((type, index) =>
      refused(type, [], index + 1),
    );

    expect(skippedBlockNames(many, [], tLabel)).toBe('a, b, c, d…');
  });
});
