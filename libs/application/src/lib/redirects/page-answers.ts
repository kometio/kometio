import type { Site } from '@kometio/domain-core';
import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
} from '@kometio/ports';
import { resolvePageGroupByPath } from '../use-cases/resolve-page-group-by-path';

export interface PageAnswersDeps {
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
}

/**
 * Whether the site serves a page at this path (`/en/blog/post`), which is
 * what makes a rule that also matches it irrelevant: a page always wins.
 * The front door of a language is a page too.
 */
export async function pageAnswersAt(
  deps: PageAnswersDeps,
  tenantId: string,
  site: Site,
  path: string,
): Promise<boolean> {
  const [locale, ...segments] = path.split('/').filter(Boolean);
  if (locale === undefined || !site.enabledLocales.includes(locale)) {
    return false;
  }
  if (segments.length === 0) return true;
  const found = await resolvePageGroupByPath(
    deps,
    tenantId,
    site.id,
    locale,
    segments.map((segment) => segment.toLowerCase()),
  );
  return found !== null && found.translation.status === 'published';
}
