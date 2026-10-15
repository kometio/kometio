import { blogStarter } from './blog.starter';
import { portfolioStarter } from './portfolio.starter';
import {
  STARTER_IDS,
  type StarterId,
  type StarterLanguage,
} from '@kometio/shared-types';
import type { Starter } from './starter';
import { studioStarter } from './studio.starter';

const BY_ID: Record<StarterId, Starter> = {
  studio: studioStarter,
  portfolio: portfolioStarter,
  blog: blogStarter,
};

/** In the order the first-run screen offers them. */
export const STARTERS: readonly Starter[] = STARTER_IDS.map((id) => BY_ID[id]);

export function findStarter(id: StarterId): Starter {
  return BY_ID[id];
}

/**
 * The language a starter is written in for a site, from the language the
 * site was made in (the wizard's choice, as on WordPress: that language is
 * the base of the site). Italian for any Italian, English for English and for
 * every language there is no starter in — `fallback` says which, so the
 * screen can say it before anything is made.
 */
export function starterLanguageFor(defaultLocale: string): {
  language: StarterLanguage;
  fallback: boolean;
} {
  const primary = defaultLocale.split('-')[0]?.toLowerCase();
  if (primary === 'it') return { language: 'it', fallback: false };
  if (primary === 'en') return { language: 'en', fallback: false };
  return { language: 'en', fallback: true };
}
