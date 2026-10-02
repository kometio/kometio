import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
  SiteRepositoryPort,
} from '@kometio/ports';
import { resolvePageGroupByPath } from './resolve-page-group-by-path';

export interface ResolveUntranslatedPageFallbackDeps {
  siteRepository: SiteRepositoryPort;
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
}

export interface ResolveUntranslatedPageFallbackInput {
  tenantId: string;
  domain: string;
  locale: string;
  /** Full URL path, root to leaf — see resolvePageGroupByPath. */
  segments: string[];
}

export interface UntranslatedPageFallbackTarget {
  locale: string;
  /** Same shape as the input's own `segments` — the path that resolved, under `locale`. */
  segments: string[];
}

/**
 * i18n a livello di campo (see the plan) — replaces the old Page-based
 * implementation, same behavior otherwise (see the original's own doc
 * comment for the full reasoning, unchanged): called only when
 * getPublishedPageBySlug already returned null for (locale, segments),
 * tries the site's default locale first, then its other enabled locales
 * in order, redirecting only when the SAME full path resolves to an
 * actually-published translation elsewhere.
 */
export async function resolveUntranslatedPageFallback(
  deps: ResolveUntranslatedPageFallbackDeps,
  input: ResolveUntranslatedPageFallbackInput,
): Promise<UntranslatedPageFallbackTarget | null> {
  const site = await deps.siteRepository.findByDomain(
    input.tenantId,
    input.domain,
  );
  if (!site) {
    return null;
  }
  if (site.untranslatedPageFallback !== 'redirect-to-default') {
    return null;
  }
  if (input.locale === site.defaultLocale) {
    return null;
  }
  if (!site.enabledLocales.includes(input.locale)) {
    return null;
  }

  const candidateLocales = [
    site.defaultLocale,
    ...site.enabledLocales.filter(
      (locale) => locale !== site.defaultLocale && locale !== input.locale,
    ),
  ];

  for (const candidateLocale of candidateLocales) {
    const resolved = await resolvePageGroupByPath(
      {
        pageGroupRepository: deps.pageGroupRepository,
        pageTranslationRepository: deps.pageTranslationRepository,
      },
      input.tenantId,
      site.id,
      candidateLocale,
      input.segments,
    );
    if (
      resolved &&
      resolved.translation.status === 'published' &&
      resolved.translation.publishedSnapshot
    ) {
      return { locale: resolved.translation.locale, segments: input.segments };
    }
  }

  return null;
}
