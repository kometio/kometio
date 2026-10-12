import { describe, expect, it } from 'vitest';
import {
  createCollectionBodySchema,
  listCollectionsQuerySchema,
  updateCollectionBodySchema,
} from './collection-requests';

const siteId = '00000000-0000-4000-8000-000000000000';

describe('collections', () => {
  it('lists a site’s', () => {
    expect(listCollectionsQuerySchema.safeParse({ siteId }).success).toBe(true);
    expect(listCollectionsQuerySchema.safeParse({}).success).toBe(false);
  });

  it('creates one with a name, and an icon if there is one', () => {
    expect(
      createCollectionBodySchema.safeParse({ siteId, name: 'News' }).success,
    ).toBe(true);
    expect(
      createCollectionBodySchema.safeParse({
        siteId,
        name: 'News',
        icon: 'newspaper',
      }).success,
    ).toBe(true);
  });

  it.each([
    ['no name', { siteId, name: '' }],
    ['a name longer than a menu entry', { siteId, name: 'x'.repeat(61) }],
    [
      'an icon name longer than a lucide one',
      { siteId, name: 'a', icon: 'x'.repeat(41) },
    ],
  ])('refuses %s', (_name, body) => {
    expect(createCollectionBodySchema.safeParse(body).success).toBe(false);
  });

  it('updates any of name, icon and default template, and null clears the template', () => {
    expect(updateCollectionBodySchema.safeParse({}).success).toBe(true);
    expect(
      updateCollectionBodySchema.safeParse({ defaultTemplateId: null }).success,
    ).toBe(true);
    expect(
      updateCollectionBodySchema.safeParse({ defaultTemplateId: 'not-an-id' })
        .success,
    ).toBe(false);
  });
});
