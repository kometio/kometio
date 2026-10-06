import { describe, expect, it } from 'vitest';
import { deploymentRecordSchema } from './deployment-record';

describe('deploymentRecordSchema', () => {
  it('says whether this deployment can send email, and whether it can export its site', () => {
    expect(
      deploymentRecordSchema.parse({
        emailConfigured: false,
        siteArchive: true,
      }),
    ).toEqual({ emailConfigured: false, siteArchive: true });
    expect(
      deploymentRecordSchema.parse({
        emailConfigured: true,
        siteArchive: false,
      }),
    ).toEqual({ emailConfigured: true, siteArchive: false });
  });

  it('refuses an answer that does not say, rather than reading it as "yes"', () => {
    expect(deploymentRecordSchema.safeParse({}).success).toBe(false);
    expect(
      deploymentRecordSchema.safeParse({ emailConfigured: true }).success,
    ).toBe(false);
    expect(
      deploymentRecordSchema.safeParse({ siteArchive: true }).success,
    ).toBe(false);
  });
});
