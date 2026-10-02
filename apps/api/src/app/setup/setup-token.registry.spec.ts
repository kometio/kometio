import { Logger } from '@nestjs/common';
import type { DeploymentBootstrapPort } from '@kometio/ports';
import { SetupTokenRegistry } from './setup-token.registry';

function buildPort(
  hasBeenSetUp: boolean,
): jest.Mocked<DeploymentBootstrapPort> {
  return {
    hasBeenSetUp: jest.fn().mockResolvedValue(hasBeenSetUp),
    bootstrap: jest.fn(),
  };
}

describe('SetupTokenRegistry', () => {
  let logged: string[];

  beforeEach(() => {
    logged = [];
    // Spying on the Logger prototype rather than reaching into the
    // instance's private field: the log line is the token's only exit from
    // this class, so reading it here is exactly what an operator does.
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((message) => {
      logged.push(String(message));
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** The token as an operator would take it: out of the printed log line. */
  function tokenFromLog(): string {
    const match = /\n\s+([A-Za-z0-9_-]{20,})\n/.exec(logged.join('\n'));
    if (!match?.[1]) {
      throw new Error(`No token found in log output:\n${logged.join('\n')}`);
    }
    return match[1];
  }

  async function bootedRegistry(hasBeenSetUp = false) {
    const registry = new SetupTokenRegistry(buildPort(hasBeenSetUp));
    await registry.onApplicationBootstrap();
    return registry;
  }

  it('issues a token, prints it, and accepts it back', async () => {
    const registry = await bootedRegistry();

    expect(logged).toHaveLength(1);
    expect(registry.verify(tokenFromLog())).toBe(true);
  });

  // An installation in service has nothing to gate, and no business
  // writing a credential into its own log on every restart.
  it('issues nothing on a deployment that is already set up', async () => {
    const registry = await bootedRegistry(true);

    expect(logged).toEqual([]);
    expect(registry.verify('anything')).toBe(false);
  });

  it('rejects a token that is not the one it issued', async () => {
    const registry = await bootedRegistry();
    const token = tokenFromLog();

    expect(registry.verify(`${token}x`)).toBe(false);
    expect(registry.verify(token.slice(0, -1))).toBe(false);
    expect(registry.verify('')).toBe(false);
  });

  // timingSafeEqual throws on mismatched lengths rather than returning
  // false. Unguarded that becomes a 500 — which hands an attacker the
  // token's length through the status code alone.
  it('returns false, rather than throwing, on a wrong-length guess', async () => {
    const registry = await bootedRegistry();

    expect(() => registry.verify('short')).not.toThrow();
    expect(registry.verify('short')).toBe(false);
  });

  it('a fresh boot invalidates the previous token', async () => {
    await bootedRegistry();
    const firstToken = tokenFromLog();

    logged = [];
    const second = await bootedRegistry();

    expect(tokenFromLog()).not.toBe(firstToken);
    expect(second.verify(firstToken)).toBe(false);
  });

  it('accepts nothing once cleared', async () => {
    const registry = await bootedRegistry();
    const token = tokenFromLog();

    registry.clear();

    expect(registry.verify(token)).toBe(false);
  });
});
