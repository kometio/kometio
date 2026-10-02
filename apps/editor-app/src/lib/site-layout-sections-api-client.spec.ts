import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getOrCreateSiteLayoutSection,
  listVersions,
  publishSiteLayoutSection,
  rollbackToVersion,
  saveDraft,
  updateSticky,
} from './site-layout-sections-api-client';
import { buildSiteLayoutSectionRecord } from '@kometio/testing/records';

const sampleSection = buildSiteLayoutSectionRecord();

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('site-layout-sections-api-client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getOrCreateSiteLayoutSection fetches by site, locale and kind', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(sampleSection));

    const result = await getOrCreateSiteLayoutSection('site-1', 'it', 'header');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        '/site-layout-sections?siteId=site-1&locale=it&kind=header',
      ),
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(result).toEqual(sampleSection);
  });

  it('saveDraft patches the content', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(sampleSection));

    await saveDraft('section-1', [{ type: 'Header', props: {} }]);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/site-layout-sections/section-1/draft'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ content: [{ type: 'Header', props: {} }] }),
      }),
    );
  });

  it('publishSiteLayoutSection posts to the publish endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(sampleSection));

    await publishSiteLayoutSection('section-1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/site-layout-sections/section-1/publish'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('listVersions fetches the version history', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([]));

    await listVersions('section-1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/site-layout-sections/section-1/versions'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('rollbackToVersion posts the versionId', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(sampleSection));

    await rollbackToVersion('section-1', 'version-1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/site-layout-sections/section-1/rollback'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ versionId: 'version-1' }),
      }),
    );
  });

  it('updateSticky patches the sticky flag', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ ...sampleSection, sticky: true }),
    );

    await updateSticky('section-1', true);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/site-layout-sections/section-1/sticky'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ sticky: true }),
      }),
    );
  });
});
