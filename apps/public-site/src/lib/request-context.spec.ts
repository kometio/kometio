import { describe, expect, it } from 'vitest';
import {
  currentVisitorIp,
  runWithRequestContext,
  visitorIpFromForwardedFor,
} from './request-context';

describe('visitorIpFromForwardedFor', () => {
  it('takes the last hop, the one the proxy closest to us observed', () => {
    // A client may send an X-Forwarded-For of its own; Caddy appends the
    // address it actually saw. The first entry is therefore whatever the
    // client typed — reading it would let a visitor choose their own
    // rate-limit bucket, one forged address per request.
    expect(visitorIpFromForwardedFor('10.9.9.9, 203.0.113.7')).toBe(
      '203.0.113.7',
    );
  });

  it('reads a single address', () => {
    expect(visitorIpFromForwardedFor('203.0.113.7')).toBe('203.0.113.7');
  });

  it('has no answer when the header is absent or empty', () => {
    expect(visitorIpFromForwardedFor(null)).toBeNull();
    expect(visitorIpFromForwardedFor('')).toBeNull();
    expect(visitorIpFromForwardedFor(' , ')).toBeNull();
  });
});

describe('the request context', () => {
  it('is null outside a request, rather than throwing', () => {
    expect(currentVisitorIp()).toBeNull();
  });

  it('reaches code the address was never passed to', () => {
    const deepInsideSomeFetch = () => currentVisitorIp();
    expect(
      runWithRequestContext({ visitorIp: '203.0.113.7' }, () =>
        deepInsideSomeFetch(),
      ),
    ).toBe('203.0.113.7');
  });

  it('survives an await, since a page render is full of them', async () => {
    const seen = await runWithRequestContext(
      { visitorIp: '203.0.113.7' },
      async () => {
        await Promise.resolve();
        return currentVisitorIp();
      },
    );
    expect(seen).toBe('203.0.113.7');
  });
});
