import { assertNoNetworkAttempts } from '@kometio/testing/no-network';

/**
 * The wiring, not the guard (that is tested in libs/testing): that the API's
 * suites run with it, so a test that reaches another machine fails with the
 * address instead of passing on a good day and flaking on a bad one.
 */
describe('the API suites', () => {
  it('cannot reach another machine, and say so when they try', async () => {
    await expect(fetch('http://203.0.113.7/')).rejects.toThrow();

    expect(() => assertNoNetworkAttempts()).toThrow('203.0.113.7:80');
  });
});
