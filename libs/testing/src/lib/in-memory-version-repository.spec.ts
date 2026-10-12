import { describe, expect, it } from 'vitest';
import { VERSION_HISTORY_LIMIT } from '@kometio/domain-core';
import { InMemoryPageGroupVersionRepository } from './in-memory-repositories.test-fixture';

const version = (id: string, pageGroupId: string, tenantId = 'tenant-1') => ({
  id,
  tenantId,
  pageGroupId,
  content: [],
  createdBy: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
});

describe('the in-memory history of a page', () => {
  it('lists the versions of one page, oldest first, and no other page’s', async () => {
    const repository = new InMemoryPageGroupVersionRepository();
    await repository.save(version('v1', 'page-a'));
    await repository.save(version('v2', 'page-b'));
    await repository.save(version('v3', 'page-a'));

    const found = await repository.listByOwner('tenant-1', 'page-a');

    expect(found.map((v) => v.id)).toEqual(['v1', 'v3']);
  });

  it('finds one by its id, within its tenant', async () => {
    const repository = new InMemoryPageGroupVersionRepository();
    await repository.save(version('v1', 'page-a'));

    expect((await repository.findById('tenant-1', 'v1'))?.id).toBe('v1');
    expect(await repository.findById('tenant-2', 'v1')).toBeNull();
    expect(await repository.listByOwner('tenant-2', 'page-a')).toEqual([]);
  });

  it('keeps only the last versions of one page, as the database does, and leaves other pages alone', async () => {
    const repository = new InMemoryPageGroupVersionRepository();
    await repository.save(version('other', 'page-b'));
    for (let n = 1; n <= VERSION_HISTORY_LIMIT + 2; n += 1) {
      await repository.save(version(`v${n}`, 'page-a'));
    }

    const kept = await repository.listByOwner('tenant-1', 'page-a');

    expect(kept).toHaveLength(VERSION_HISTORY_LIMIT);
    expect(kept[0].id).toBe('v3');
    expect(kept.at(-1)?.id).toBe(`v${VERSION_HISTORY_LIMIT + 2}`);
    expect(await repository.findById('tenant-1', 'v1')).toBeNull();
    expect(await repository.findById('tenant-1', 'other')).not.toBeNull();
  });
});
