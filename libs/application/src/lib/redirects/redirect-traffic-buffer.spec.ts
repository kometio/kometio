import { afterEach, describe, expect, it, vi } from 'vitest';
import { RedirectTrafficBuffer } from './redirect-traffic-buffer';

function setup(
  options: ConstructorParameters<typeof RedirectTrafficBuffer>[2] = {},
) {
  const addHits = vi.fn().mockResolvedValue(undefined);
  const record = vi.fn().mockResolvedValue(undefined);
  const at = new Date('2026-10-14T10:00:00Z');
  const buffer = new RedirectTrafficBuffer(
    { addHits },
    { record },
    {
      now: () => at,
      ...options,
    },
  );
  return { buffer, addHits, record, at };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('RedirectTrafficBuffer', () => {
  it('writes nothing until it is flushed, and one batch when it is', async () => {
    const { buffer, addHits, record, at } = setup();
    buffer.recordHit({ tenantId: 't', redirectId: 'r1' });
    buffer.recordHit({ tenantId: 't', redirectId: 'r1' });
    buffer.recordHit({ tenantId: 't', redirectId: 'r2' });
    buffer.recordMiss({ tenantId: 't', siteId: 's', path: '/lost' });
    buffer.recordMiss({ tenantId: 't', siteId: 's', path: '/lost' });
    expect(addHits).not.toHaveBeenCalled();

    await buffer.flush();

    expect(addHits).toHaveBeenCalledWith([
      { tenantId: 't', redirectId: 'r1', hits: 2, at },
      { tenantId: 't', redirectId: 'r2', hits: 1, at },
    ]);
    expect(record).toHaveBeenCalledWith([
      { tenantId: 't', siteId: 's', path: '/lost', hits: 2, at },
    ]);
    await buffer.stop();
  });

  it('writes on its own time, once started by the first count', async () => {
    vi.useFakeTimers();
    const { buffer, addHits } = setup({ flushEveryMs: 1000 });

    buffer.recordHit({ tenantId: 't', redirectId: 'r1' });
    await vi.advanceTimersByTimeAsync(1000);

    expect(addHits).toHaveBeenCalledTimes(1);
    await buffer.stop();
  });

  it('writes nothing when nothing was counted', async () => {
    const { buffer, addHits, record } = setup();

    await buffer.flush();

    expect(addHits).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('keeps a count whose write failed, for the next one, and says so', async () => {
    const onError = vi.fn();
    const { buffer, addHits } = setup({ onError });
    addHits.mockRejectedValueOnce(new Error('database away'));
    buffer.recordHit({ tenantId: 't', redirectId: 'r1' });

    await buffer.flush();
    buffer.recordHit({ tenantId: 't', redirectId: 'r1' });
    await buffer.flush();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(addHits).toHaveBeenLastCalledWith([
      expect.objectContaining({ redirectId: 'r1', hits: 2 }),
    ]);
    await buffer.stop();
  });

  it('does not hold more distinct addresses than it is allowed', async () => {
    const { buffer, record } = setup();
    for (let index = 0; index < 6000; index += 1) {
      buffer.recordMiss({ tenantId: 't', siteId: 's', path: `/p${index}` });
    }

    await buffer.flush();

    const written: unknown = record.mock.calls[0]?.[0];
    expect(written).toHaveLength(5000);
    await buffer.stop();
  });

  it('writes what is left when it is stopped', async () => {
    const { buffer, addHits } = setup();
    buffer.recordHit({ tenantId: 't', redirectId: 'r1' });

    await buffer.stop();

    expect(addHits).toHaveBeenCalledTimes(1);
  });
});
