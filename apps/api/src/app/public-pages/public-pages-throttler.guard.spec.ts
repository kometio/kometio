import {
  PUBLIC_API_SERVICE_TOKEN_HEADER,
  PUBLIC_API_VISITOR_IP_HEADER,
} from '@kometio/api-contracts';
import { vouchedVisitorOf } from './public-pages-throttler.guard';

/**
 * The guard's one job: decide WHOSE bucket a request spends. Nest's
 * throttler around it is exercised by the integration spec; this is the
 * decision alone.
 */
const SERVICE_TOKEN = 'a-real-deployment-secret-of-some-length';
const VISITOR = '203.0.113.7';

const request = (headers: Record<string, string>) => ({ headers });

describe('vouchedVisitorOf', () => {
  const vouchedVisitor = vouchedVisitorOf(SERVICE_TOKEN);

  it('counts the visitor when this deployment’s own site vouches for them', () => {
    expect(
      vouchedVisitor(
        request({
          [PUBLIC_API_SERVICE_TOKEN_HEADER]: SERVICE_TOKEN,
          [PUBLIC_API_VISITOR_IP_HEADER]: VISITOR,
        }),
      ),
    ).toBe(VISITOR);
  });

  it('ignores an address nobody vouched for', () => {
    // The API answers on a public hostname. Believing this header
    // unauthenticated would let anyone pick a fresh bucket per request
    // and never be limited at all.
    expect(
      vouchedVisitor(request({ [PUBLIC_API_VISITOR_IP_HEADER]: VISITOR })),
    ).toBeNull();
  });

  it('ignores an address vouched for with the wrong token', () => {
    expect(
      vouchedVisitor(
        request({
          [PUBLIC_API_SERVICE_TOKEN_HEADER]: 'not-the-secret',
          [PUBLIC_API_VISITOR_IP_HEADER]: VISITOR,
        }),
      ),
    ).toBeNull();
  });

  it('does not throw on a token of a different length, which would leak it', () => {
    expect(() =>
      vouchedVisitor(
        request({
          [PUBLIC_API_SERVICE_TOKEN_HEADER]: 'x',
          [PUBLIC_API_VISITOR_IP_HEADER]: VISITOR,
        }),
      ),
    ).not.toThrow();
  });

  it('trusts nothing when the deployment configured no token', () => {
    expect(
      vouchedVisitorOf(undefined)(
        request({
          [PUBLIC_API_SERVICE_TOKEN_HEADER]: '',
          [PUBLIC_API_VISITOR_IP_HEADER]: VISITOR,
        }),
      ),
    ).toBeNull();
  });
});
