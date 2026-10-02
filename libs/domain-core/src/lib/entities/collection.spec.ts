import { describe, expect, it } from 'vitest';
import { Collection, DEFAULT_COLLECTION_ICON } from './collection';

const base = { id: 'collection-1', tenantId: 'tenant-1', siteId: 'site-1' };

describe('Collection entity', () => {
  it('starts with the fallback icon when nobody picked one', () => {
    const collection = Collection.create({ ...base, name: 'News' });
    expect(collection.icon).toBe(DEFAULT_COLLECTION_ICON);
    expect(collection.name).toBe('News');
    expect(collection.order).toBe(0);
  });

  /*
   * A sidebar entry with no icon is a hole in a list of eleven, so an
   * empty one falls back rather than being stored.
   */
  it('falls back rather than storing an empty icon', () => {
    const collection = Collection.create({ ...base, name: 'News', icon: '' });
    expect(collection.icon).toBe(DEFAULT_COLLECTION_ICON);

    collection.changeIcon('star');
    expect(collection.icon).toBe('star');

    collection.changeIcon('');
    expect(collection.icon).toBe(DEFAULT_COLLECTION_ICON);
  });

  it('renaming moves its clock', () => {
    const collection = Collection.create({
      ...base,
      name: 'News',
      now: new Date('2026-01-01T00:00:00Z'),
    });

    collection.rename('Press', new Date('2026-03-01T00:00:00Z'));

    expect(collection.name).toBe('Press');
    expect(collection.updatedAt).toEqual(new Date('2026-03-01T00:00:00Z'));
  });

  it('create() exposes every prop via its getters', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const collection = Collection.create({
      ...base,
      name: 'News',
      icon: 'star',
      order: 3,
      now,
    });

    expect(collection.id).toBe('collection-1');
    expect(collection.tenantId).toBe('tenant-1');
    expect(collection.siteId).toBe('site-1');
    expect(collection.name).toBe('News');
    expect(collection.icon).toBe('star');
    expect(collection.order).toBe(3);
    expect(collection.createdAt).toEqual(now);
    expect(collection.updatedAt).toEqual(now);
  });

  it('reorder moves it in the sidebar', () => {
    const collection = Collection.create({ ...base, name: 'News' });

    collection.reorder(2, new Date('2026-03-01T00:00:00Z'));

    expect(collection.order).toBe(2);
    expect(collection.updatedAt).toEqual(new Date('2026-03-01T00:00:00Z'));
  });

  it('starts with no default template, and can be given one and have it taken away', () => {
    const collection = Collection.create({
      ...base,
      name: 'News',
      now: new Date('2026-01-01T00:00:00Z'),
    });
    expect(collection.defaultTemplateId).toBeNull();

    collection.setDefaultTemplate(
      'template-1',
      new Date('2026-03-01T00:00:00Z'),
    );
    expect(collection.defaultTemplateId).toBe('template-1');
    expect(collection.updatedAt).toEqual(new Date('2026-03-01T00:00:00Z'));

    collection.setDefaultTemplate(null);
    expect(collection.defaultTemplateId).toBeNull();
  });

  it('fromProps/toProps round-trip without loss', () => {
    const props = {
      ...base,
      name: 'Events',
      icon: 'calendar-days',
      order: 2,
      defaultTemplateId: 'template-1',
      createdAt: new Date('2025-12-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    };

    expect(Collection.fromProps(props).toProps()).toEqual(props);
  });
});
