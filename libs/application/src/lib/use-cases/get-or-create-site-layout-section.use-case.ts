import { randomUUID } from 'node:crypto';
import {
  SiteLayoutSection,
  type SiteLayoutSectionKind,
} from '@kometio/domain-core';
import type {
  SiteLayoutSectionRepositoryPort,
  SiteRepositoryPort,
} from '@kometio/ports';
import { requireSite } from './require-site';

export interface GetOrCreateSiteLayoutSectionDeps {
  siteRepository: SiteRepositoryPort;
  siteLayoutSectionRepository: SiteLayoutSectionRepositoryPort;
}

export interface GetOrCreateSiteLayoutSectionInput {
  tenantId: string;
  siteId: string;
  locale: string;
  kind: SiteLayoutSectionKind;
}

/**
 * The header and footer have nothing to ask the user before being created
 * (no slug, no seoMeta, docs/adr/0018) — the first visit to the
 * "Appearance" editor for a given (site, locale, kind) implicitly creates
 * the row, so the editor never has to handle a "does not exist yet" state.
 *
 * When the site already has a published header or footer in its default
 * locale, the new draft starts as a copy of that content rather than empty
 * — the same "copy-on-translate" philosophy as createPageTranslation (phase
 * 5b): enabling a language must not force rebuilding the header from
 * scratch.
 *
 * The TOCTOU race between two tabs open at once is deliberately not
 * handled: the realistic user is a single non-technical admin, not a
 * high-concurrency SaaS. The DB's unique constraint remains the backstop.
 */
export async function getOrCreateSiteLayoutSection(
  deps: GetOrCreateSiteLayoutSectionDeps,
  input: GetOrCreateSiteLayoutSectionInput,
): Promise<SiteLayoutSection> {
  const site = await requireSite(
    deps.siteRepository,
    input.tenantId,
    input.siteId,
  );

  const existing = await deps.siteLayoutSectionRepository.findBySiteLocaleKind(
    input.tenantId,
    input.siteId,
    input.locale,
    input.kind,
  );
  if (existing) {
    return existing;
  }

  let content;
  let sticky;
  if (input.locale !== site.defaultLocale) {
    const defaultSection =
      await deps.siteLayoutSectionRepository.findBySiteLocaleKind(
        input.tenantId,
        input.siteId,
        site.defaultLocale,
        input.kind,
      );
    content = defaultSection?.content;
    sticky = defaultSection?.sticky;
  }

  const section = SiteLayoutSection.create({
    id: randomUUID(),
    tenantId: input.tenantId,
    siteId: input.siteId,
    locale: input.locale,
    kind: input.kind,
    content,
    sticky,
  });
  await deps.siteLayoutSectionRepository.add(section);
  return section;
}
