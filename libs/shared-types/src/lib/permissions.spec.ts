import { describe, expect, it } from 'vitest';
import { hasPermission } from './permissions';

describe('hasPermission', () => {
  it('lets an editor write drafts and nothing that goes online', () => {
    expect(hasPermission('editor', 'editDrafts')).toBe(true);
    expect(hasPermission('editor', 'changeLiveSite')).toBe(false);
    expect(hasPermission('editor', 'delete')).toBe(false);
    expect(hasPermission('editor', 'configureSite')).toBe(false);
  });

  it('lets a publisher change the live site and delete, not configure it', () => {
    expect(hasPermission('publisher', 'changeLiveSite')).toBe(true);
    expect(hasPermission('publisher', 'delete')).toBe(true);
    expect(hasPermission('publisher', 'configureSite')).toBe(false);
  });

  it('lets an admin do everything, and nobody anything before the role is known', () => {
    for (const permission of [
      'editDrafts',
      'changeLiveSite',
      'delete',
      'configureSite',
    ] as const) {
      expect(hasPermission('admin', permission)).toBe(true);
      expect(hasPermission(null, permission)).toBe(false);
    }
  });
});
