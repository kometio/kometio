import { MediaNotFoundError, SiteNotFoundError } from '@kometio/domain-core';
import type {
  MediaRepositoryPort,
  MediaUsagePort,
  SiteRepositoryPort,
} from '@kometio/ports';

export interface GetMediaUsagesDeps {
  mediaRepository: MediaRepositoryPort;
  mediaUsage: MediaUsagePort;
  siteRepository: Pick<SiteRepositoryPort, 'findById'>;
}

export interface GetMediaUsagesInput {
  tenantId: string;
  mediaId: string;
}

export interface MediaUsage {
  pages: { pageGroupId: string; title: string; locales: string[] }[];
  sections: { sectionId: string; name: string; kind: 'shared' | 'template' }[];
  layout: { kind: 'header' | 'footer'; locale: string }[];
}

/**
 * Where a file is used, for the question "what would this leave a hole
 * in?" before it is deleted.
 *
 * A page is one entry however many of its languages hold the file, named
 * as the site's default language names it (its title, or its address when
 * it has none there) and falling back to the first language that has
 * something to call it by.
 */
export async function getMediaUsages(
  deps: GetMediaUsagesDeps,
  input: GetMediaUsagesInput,
): Promise<MediaUsage> {
  const media = await deps.mediaRepository.findById(
    input.tenantId,
    input.mediaId,
  );
  if (!media) {
    throw new MediaNotFoundError(input.mediaId);
  }
  const site = await deps.siteRepository.findById(input.tenantId, media.siteId);
  if (!site) {
    throw new SiteNotFoundError(media.siteId);
  }

  const rows = await deps.mediaUsage.findUsages(
    input.tenantId,
    media.siteId,
    media.id,
  );

  const byPage = new Map<string, typeof rows.pages>();
  for (const row of rows.pages) {
    byPage.set(row.pageGroupId, [...(byPage.get(row.pageGroupId) ?? []), row]);
  }
  const pages = [...byPage.entries()].map(([pageGroupId, translations]) => {
    const named =
      translations.find((row) => row.locale === site.defaultLocale) ??
      translations[0];
    return {
      pageGroupId,
      title: named?.title?.trim() || named?.slug || '',
      locales: translations.map((row) => row.locale).sort(),
    };
  });

  return {
    pages: pages.sort((a, b) => a.title.localeCompare(b.title)),
    sections: [...rows.sections].sort((a, b) => a.name.localeCompare(b.name)),
    layout: rows.layout,
  };
}
