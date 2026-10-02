import { createHmac, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PreviewTokenAdapter } from './preview-token.adapter';

/**
 * A pure unit test, no Postgres: validation is only an HMAC signature plus
 * an expiry check, never a query. See the design comment in
 * preview-token.adapter.ts.
 */
describe('PreviewTokenAdapter', () => {
  const secret = 'test-secret';
  const adapter = new PreviewTokenAdapter(secret);

  it('creates a token that validates back to the same content', async () => {
    const tenantId = randomUUID();
    const pageId = randomUUID();
    const created = await adapter.createToken(
      tenantId,
      'page',
      pageId,
      1000 * 60 * 60,
    );

    const validated = await adapter.validateToken(
      created.token,
      'page',
      pageId,
    );

    expect(validated?.tenantId).toBe(tenantId);
    expect(validated?.contentType).toBe('page');
    expect(validated?.contentId).toBe(pageId);
  });

  it('is non-consuming: validating twice both succeed', async () => {
    const pageId = randomUUID();
    const created = await adapter.createToken(
      randomUUID(),
      'page',
      pageId,
      1000 * 60,
    );

    const first = await adapter.validateToken(created.token, 'page', pageId);
    const second = await adapter.validateToken(created.token, 'page', pageId);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
  });

  it('rejects a token validated against a mismatched contentId', async () => {
    const pageId = randomUUID();
    const created = await adapter.createToken(
      randomUUID(),
      'page',
      pageId,
      1000 * 60,
    );

    expect(
      await adapter.validateToken(created.token, 'page', randomUUID()),
    ).toBeNull();
  });

  it('rejects a token validated against a mismatched contentType', async () => {
    const sectionId = randomUUID();
    const created = await adapter.createToken(
      randomUUID(),
      'section',
      sectionId,
      1000 * 60,
    );

    expect(
      await adapter.validateToken(created.token, 'page', sectionId),
    ).toBeNull();
  });

  it('rejects an unknown/malformed token', async () => {
    expect(
      await adapter.validateToken('not-a-real-token', 'page', randomUUID()),
    ).toBeNull();
    expect(await adapter.validateToken('', 'page', randomUUID())).toBeNull();
  });

  it('rejects an expired token', async () => {
    const pageId = randomUUID();
    const created = await adapter.createToken(
      randomUUID(),
      'page',
      pageId,
      -1000,
    );

    expect(
      await adapter.validateToken(created.token, 'page', pageId),
    ).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const pageId = randomUUID();
    const otherAdapter = new PreviewTokenAdapter('a-different-secret');
    const created = await otherAdapter.createToken(
      randomUUID(),
      'page',
      pageId,
      1000 * 60,
    );

    expect(
      await adapter.validateToken(created.token, 'page', pageId),
    ).toBeNull();
  });

  it('rejects a token whose payload was tampered with', async () => {
    const pageId = randomUUID();
    const otherPageId = randomUUID();
    const created = await adapter.createToken(
      randomUUID(),
      'page',
      pageId,
      1000 * 60,
    );
    const [, signature] = created.token.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        tenantId: randomUUID(),
        contentType: 'page',
        contentId: otherPageId,
        expiresAt: Date.now() + 1000 * 60,
      }),
    ).toString('base64url');

    expect(
      await adapter.validateToken(
        `${tamperedPayload}.${signature}`,
        'page',
        otherPageId,
      ),
    ).toBeNull();
  });

  /*
   * A correctly signed payload that lacks `expiresAt` used to compare
   * `undefined <= now` as false, and so never expired. Signed, then, is
   * not enough: the payload has to be the shape this code writes.
   */
  it('rejects a correctly signed payload that is not the shape it writes', async () => {
    const payloadB64 = Buffer.from(
      JSON.stringify({ tenantId: 't', contentType: 'page', contentId: 'p' }),
    ).toString('base64url');
    const signature = createHmac('sha256', secret)
      .update(payloadB64)
      .digest('base64url');

    expect(
      await adapter.validateToken(`${payloadB64}.${signature}`, 'page', 'p'),
    ).toBeNull();
  });
});
