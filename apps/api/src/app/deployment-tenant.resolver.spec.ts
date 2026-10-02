import type { TenantDirectoryPort } from '@kometio/ports';
import { DeploymentTenantResolver } from './deployment-tenant.resolver';

/** A directory holding `ids` in order, counting how often it is asked. */
class FakeTenantDirectory implements TenantDirectoryPort {
  asked = 0;
  private readonly answers: string[][];

  constructor(...answers: string[][]) {
    this.answers = answers;
  }

  async listIds(limit: number): Promise<string[]> {
    const answer =
      this.answers[Math.min(this.asked, this.answers.length - 1)] ?? [];
    this.asked += 1;
    return answer.slice(0, limit);
  }
}

describe('DeploymentTenantResolver', () => {
  it('prefers DEFAULT_TENANT_ID and never touches the database', async () => {
    const directory = new FakeTenantDirectory(['from-db']);
    const resolver = new DeploymentTenantResolver(directory, 'from-env');

    expect(await resolver.resolve()).toBe('from-env');
    expect(directory.asked).toBe(0);
  });

  it('falls back to the single tenant when the env var is unset', async () => {
    const directory = new FakeTenantDirectory(['the-only-tenant']);

    expect(
      await new DeploymentTenantResolver(directory, undefined).resolve(),
    ).toBe('the-only-tenant');
  });

  it('resolves to null when nothing has been set up yet', async () => {
    expect(
      await new DeploymentTenantResolver(
        new FakeTenantDirectory([]),
        undefined,
      ).resolve(),
    ).toBeNull();
  });

  it('asks once and caches the answer', async () => {
    const directory = new FakeTenantDirectory(['t1']);
    const resolver = new DeploymentTenantResolver(directory, undefined);

    await resolver.resolve();
    await resolver.resolve();

    expect(directory.asked).toBe(1);
  });

  it('refuses to guess when more than one tenant exists', async () => {
    await expect(
      new DeploymentTenantResolver(
        new FakeTenantDirectory(['a', 'b']),
        undefined,
      ).resolve(),
    ).rejects.toThrow(/single-tenant per deployment/);
  });

  it('re-asks after refresh() when the last answer was "not set up"', async () => {
    // What the wizard relies on: the process was already running, and
    // answering "no tenant", when setup created one.
    const resolver = new DeploymentTenantResolver(
      new FakeTenantDirectory([], ['just-created']),
      undefined,
    );

    expect(await resolver.resolve()).toBeNull();
    resolver.refresh();

    expect(await resolver.resolve()).toBe('just-created');
  });

  it('keeps a resolved id across refresh()', async () => {
    const directory = new FakeTenantDirectory(['settled']);
    const resolver = new DeploymentTenantResolver(directory, undefined);

    await resolver.resolve();
    resolver.refresh();

    expect(await resolver.resolve()).toBe('settled');
    expect(directory.asked).toBe(1);
  });
});

describe('DeploymentTenantResolver.require', () => {
  it('returns the id when there is one', async () => {
    expect(
      await new DeploymentTenantResolver(
        new FakeTenantDirectory(['set-up']),
        undefined,
      ).require(),
    ).toBe('set-up');
  });

  it('throws rather than returning null when nothing is set up', async () => {
    await expect(
      new DeploymentTenantResolver(
        new FakeTenantDirectory([]),
        undefined,
      ).require(),
    ).rejects.toThrow(/has not been set up/);
  });
});
