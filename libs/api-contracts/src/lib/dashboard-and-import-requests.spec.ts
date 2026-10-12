import { describe, expect, it } from 'vitest';
import { getDashboardStatsQuerySchema } from './dashboard-requests';
import {
  listImportJobsQuerySchema,
  startWordPressAnalysisBodySchema,
} from './import-requests';

const siteId = '00000000-0000-4000-8000-000000000000';

describe.each([
  ['getDashboardStatsQuerySchema', getDashboardStatsQuerySchema],
  ['listImportJobsQuerySchema', listImportJobsQuerySchema],
  ['startWordPressAnalysisBodySchema', startWordPressAnalysisBodySchema],
])('%s', (_name, schema) => {
  it('asks for a site and nothing else', () => {
    expect(schema.safeParse({ siteId }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ siteId: 'not-an-id' }).success).toBe(false);
  });
});
