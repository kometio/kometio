import { describe, expect, it } from 'vitest';
import { deploymentRecordSchema } from './deployment-record';

describe('deploymentRecordSchema', () => {
  it('says whether this deployment can send email, whether it can export its site, and whether it is a demo', () => {
    expect(
      deploymentRecordSchema.parse({
        emailConfigured: false,
        siteArchive: true,
        demo: false,
      }),
    ).toEqual({ emailConfigured: false, siteArchive: true, demo: false });
    expect(
      deploymentRecordSchema.parse({
        emailConfigured: true,
        siteArchive: false,
        demo: true,
      }),
    ).toEqual({ emailConfigured: true, siteArchive: false, demo: true });
  });

  it('refuses an answer that does not say, rather than reading it as "yes"', () => {
    expect(deploymentRecordSchema.safeParse({}).success).toBe(false);
    expect(
      deploymentRecordSchema.safeParse({ emailConfigured: true }).success,
    ).toBe(false);
    expect(
      deploymentRecordSchema.safeParse({ siteArchive: true }).success,
    ).toBe(false);
    expect(
      deploymentRecordSchema.safeParse({
        emailConfigured: true,
        siteArchive: false,
      }).success,
    ).toBe(false);
  });
});
