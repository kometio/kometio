import type { DeploymentLocalePort } from '@kometio/ports';

/** A deployment whose site is written in `locale`, or has none yet (`null`). */
export class FakeDeploymentLocale implements DeploymentLocalePort {
  constructor(private readonly locale: string | null = 'it') {}

  async defaultLocale(): Promise<string | null> {
    return this.locale;
  }
}
