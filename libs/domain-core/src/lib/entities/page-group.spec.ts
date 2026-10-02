import { describe, expect, it } from 'vitest';
import { PageGroup } from './page-group';

describe('PageGroup entity', () => {
  const baseInput = {
    id: 'group-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
  };

  it('starts with no parent, order 0, and empty content', () => {
    const group = PageGroup.create(baseInput);
    expect(group.parentId).toBeNull();
    expect(group.order).toBe(0);
    expect(group.content).toEqual([]);
  });

  it('saveContent replaces the shared structure', () => {
    const group = PageGroup.create(baseInput);
    group.saveContent(
      [{ id: 'hero-1', type: 'Hero', props: { title: 'Ciao' } }],
      {
        by: 'user-1',
      },
    );
    expect(group.content).toEqual([
      { id: 'hero-1', type: 'Hero', props: { title: 'Ciao' } },
    ]);
  });

  it('setParent reassigns the parent and bumps updatedAt', () => {
    const group = PageGroup.create(baseInput);
    const now = new Date('2026-02-01T00:00:00Z');

    group.setParent('parent-1', { by: 'user-1', now });

    expect(group.parentId).toBe('parent-1');
    expect(group.updatedAt).toEqual(now);
    expect(group.updatedBy).toBe('user-1');
  });

  it('reorder reassigns the sibling position and bumps updatedAt', () => {
    const group = PageGroup.create(baseInput);
    const now = new Date('2026-02-01T00:00:00Z');

    group.reorder(3, { by: 'user-1', now });

    expect(group.order).toBe(3);
    expect(group.updatedAt).toEqual(now);
  });

  it('create() exposes every prop via its getters', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const group = PageGroup.create({ ...baseInput, now });

    expect(group.id).toBe('group-1');
    expect(group.tenantId).toBe('tenant-1');
    expect(group.siteId).toBe('site-1');
    expect(group.createdAt).toEqual(now);
    expect(group.updatedAt).toEqual(now);
  });

  it('a reorder or a reparenting is not a content change (a moved page needs no publish)', () => {
    const group = PageGroup.create({
      ...baseInput,
      now: new Date('2026-01-01T00:00:00Z'),
    });
    const later = new Date('2026-03-01T00:00:00Z');

    group.reorder(3, { by: 'user-1', now: later });
    expect(group.contentUpdatedAt).toEqual(new Date('2026-01-01T00:00:00Z'));

    group.saveContent([], { by: 'user-1', now: later });
    expect(group.contentUpdatedAt).toEqual(later);
  });

  it('a page belongs to no section until somebody files it in one', () => {
    const group = PageGroup.create(baseInput);
    expect(group.collectionId).toBeNull();

    group.moveToCollection('collection-1', { by: 'user-1' });
    expect(group.collectionId).toBe('collection-1');

    group.moveToCollection(null, { by: 'user-1' });
    expect(group.collectionId).toBeNull();
  });

  it('fromProps/toProps round-trip without loss', () => {
    const props = {
      ...baseInput,
      parentId: 'parent-1',
      order: 2,
      collectionId: null,
      content: [{ type: 'Hero', props: { title: 'v1' } }],
      createdBy: 'user-1',
      createdAt: new Date('2025-12-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      updatedBy: 'user-2',
      contentUpdatedAt: new Date('2026-01-01T00:00:00Z'),
    };

    const group = PageGroup.fromProps(props);

    expect(group.toProps()).toEqual(props);
  });
});
