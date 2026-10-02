import { describe, expect, it } from 'vitest';
import { collectionRecordSchema } from './collection-record';

const collection = {
  id: 'c1',
  tenantId: 'tenant-1',
  siteId: 'site-1',
  name: 'Articoli',
  icon: 'newspaper',
  order: 0,
  defaultTemplateId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('collectionRecordSchema', () => {
  it('accepts a collection with and without a default template', () => {
    expect(collectionRecordSchema.parse(collection)).toEqual(collection);
    expect(
      collectionRecordSchema.parse({ ...collection, defaultTemplateId: 't1' })
        .defaultTemplateId,
    ).toBe('t1');
  });

  it('refuses one without its icon (the sidebar draws it)', () => {
    const { icon: _icon, ...without } = collection;
    expect(collectionRecordSchema.safeParse(without).success).toBe(false);
  });
});
