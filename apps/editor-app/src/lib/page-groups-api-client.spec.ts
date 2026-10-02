import { afterEach, describe, expect, it, vi } from 'vitest';
import * as http from './http-client';
import { listPageGroups } from './page-groups-api-client';

vi.mock('./http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./http-client')>()),
  request: vi.fn(),
}));

describe('listPageGroups', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  async function queryOf(filters: Parameters<typeof listPageGroups>[3]) {
    vi.mocked(http.request).mockResolvedValue({ items: [], total: 0 });
    await listPageGroups('site-1', 1, 20, filters);
    const [path] = vi.mocked(http.request).mock.calls[0] ?? [];
    return new URL(String(path), 'http://x').searchParams;
  }

  it('sends the state as a filter of its own', async () => {
    const query = await queryOf({ status: 'draft' });

    expect(query.get('status')).toBe('draft');
    expect(query.get('siteId')).toBe('site-1');
  });

  it('leaves it out when there is none, rather than sending an empty one', async () => {
    const query = await queryOf({ search: 'chi' });

    expect(query.has('status')).toBe(false);
    expect(query.get('search')).toBe('chi');
  });
});
