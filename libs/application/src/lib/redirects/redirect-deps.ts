import type {
  MissingPathRepositoryPort,
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
  RedirectRepositoryPort,
  SiteRepositoryPort,
} from '@kometio/ports';
import type { RedirectRuleSets } from './redirect-rule-sets';

/** What the redirect use cases are built from, together: they share one rule set per site and one idea of a page's address. */
export interface RedirectDeps {
  redirectRepository: RedirectRepositoryPort;
  missingPathRepository: MissingPathRepositoryPort;
  siteRepository: SiteRepositoryPort;
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  ruleSets: RedirectRuleSets;
}
