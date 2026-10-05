import { describe, expect, it } from 'vitest';
import { deploymentRecordSchema } from './deployment-record';

describe('deploymentRecordSchema', () => {
  it('says whether this deployment can send email', () => {
    expect(deploymentRecordSchema.parse({ emailConfigured: false })).toEqual({
      emailConfigured: false,
    });
    expect(deploymentRecordSchema.parse({ emailConfigured: true })).toEqual({
      emailConfigured: true,
    });
  });

  it('refuses an answer that does not say, rather than reading it as "yes"', () => {
    expect(deploymentRecordSchema.safeParse({}).success).toBe(false);
  });
});
