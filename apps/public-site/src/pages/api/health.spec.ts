import { describe, expect, it } from 'vitest';
import { GET } from './health';

describe('GET /api/health', () => {
  it('returns 200 with a status ok body', async () => {
    // @ts-expect-error -- this handler ignores every argument
    const res = await GET({});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });
});
