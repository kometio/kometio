import { describe, expect, it } from 'vitest';
import { availableThemesResponseSchema } from './available-theme';

describe('availableThemesResponseSchema', () => {
  it('lists themes, marking the ones uploaded from the editor', () => {
    const themes = [
      { name: 'classic', uploaded: false },
      { name: 'portfolio', uploaded: true },
    ];

    expect(availableThemesResponseSchema.parse(themes)).toEqual(themes);
  });

  it('refuses an entry that does not say whether it was uploaded', () => {
    expect(
      availableThemesResponseSchema.safeParse([{ name: 'classic' }]).success,
    ).toBe(false);
  });
});
