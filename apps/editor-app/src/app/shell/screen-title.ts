import { useMatches } from '@tanstack/react-router';
import { useTranslation } from '../../lib/use-translation';

/** The screens that name themselves in the narrow bar: their own words, already written for the sidebar. */
export type ScreenTitleKey =
  | 'shell.nav.dashboard'
  | 'shell.nav.pages'
  | 'shell.nav.collections'
  | 'shell.nav.imports'
  | 'shell.nav.media'
  | 'shell.nav.forms'
  | 'shell.nav.taxonomies'
  | 'shell.nav.layout'
  | 'shell.nav.sections'
  | 'shell.nav.style'
  | 'shell.nav.settings'
  | 'shell.account.profile';

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** What the narrow bar says this screen is called, beside the mark. A route with none says nothing. */
    titleKey?: ScreenTitleKey;
  }
}

/**
 * The name of the screen you are on, for the bar that replaces the sidebar
 * on a phone — where there is no highlighted entry to say it.
 *
 * Read from the route, not from a table kept beside it: the route that
 * exists is the route that names itself, so a screen added later has one
 * place to say what it is called.
 */
export function useScreenTitle(): string | null {
  const { t } = useTranslation();
  // The deepest route that names itself: a section of the settings is
  // still "Settings", and the settings route is the one that says so.
  const titleKey = useMatches({
    select: (matches) =>
      matches
        .map((match) => match.staticData.titleKey)
        .filter((key): key is ScreenTitleKey => key !== undefined)
        .pop(),
  });
  return titleKey ? t(titleKey) : null;
}
