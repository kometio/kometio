import { describe, expect, it, vi } from 'vitest';
import { Redirect } from '@kometio/domain-core';
import { RedirectRuleSets } from './redirect-rule-sets';

function rule(from: string) {
  return Redirect.create({
    id: from,
    tenantId: 't',
    siteId: 's',
    from,
    to: { kind: 'url', url: '/target' },
    status: 301,
    origin: 'manual',
    createdBy: null,
  });
}

describe('RedirectRuleSets', () => {
  it('reads a site once for as long as its set is kept, and shares a read in flight', async () => {
    const listBySite = vi.fn().mockResolvedValue([rule('/a')]);
    const sets = new RedirectRuleSets({ listBySite }, 1000, () => 0);

    const [first, second] = await Promise.all([
      sets.forSite('t', 's'),
      sets.forSite('t', 's'),
    ]);
    await sets.forSite('t', 's');

    expect(listBySite).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('compiles what it read', async () => {
    const sets = new RedirectRuleSets(
      { listBySite: vi.fn().mockResolvedValue([rule('/a')]) },
      1000,
      () => 0,
    );

    const { matcher } = await sets.forSite('t', 's');

    expect(matcher.match({ path: '/a', params: new Map() })?.rule.id).toBe(
      '/a',
    );
  });

  it('reads again when the time is up', async () => {
    let now = 0;
    const listBySite = vi.fn().mockResolvedValue([]);
    const sets = new RedirectRuleSets({ listBySite }, 1000, () => now);

    await sets.forSite('t', 's');
    now = 999;
    await sets.forSite('t', 's');
    now = 1000;
    await sets.forSite('t', 's');

    expect(listBySite).toHaveBeenCalledTimes(2);
  });

  it('reads again after a change made here', async () => {
    const listBySite = vi.fn().mockResolvedValue([]);
    const sets = new RedirectRuleSets({ listBySite }, 1000, () => 0);
    await sets.forSite('t', 's');

    sets.invalidate('s');
    await sets.forSite('t', 's');

    expect(listBySite).toHaveBeenCalledTimes(2);
  });

  it('does not keep a read that failed', async () => {
    const listBySite = vi
      .fn()
      .mockRejectedValueOnce(new Error('away'))
      .mockResolvedValue([]);
    const sets = new RedirectRuleSets({ listBySite }, 1000, () => 0);

    await expect(sets.forSite('t', 's')).rejects.toThrow('away');
    await expect(sets.forSite('t', 's')).resolves.toBeDefined();
  });
});
