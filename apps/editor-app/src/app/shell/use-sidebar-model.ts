import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCurrentSession } from '../auth/use-current-session';
import { collectionIcon } from '../collections/collection-icons';
import { collectionsQueryOptions } from '../collections/collections-queries';
import { siteQueryOptions } from '../settings/site-queries';
import { NAV_ENTRIES, type NavGroupId } from './nav-entries';

/** One destination of the sidebar, in the words and the picture both of its shapes need. */
export interface SidebarLink {
  key: string;
  to: string;
  params?: Record<string, string>;
  icon: LucideIcon;
  /** The whole name: the sidebar's own words, a screen reader's, a tooltip. */
  label: string;
  /** The word under the picture in the folded strip — the whole name unless it does not fit. */
  shortLabel: string;
  /** A collection of the site's, which the folded strip may gather into one item. */
  isCollection?: boolean;
}

export interface SidebarModel {
  /** The dashboard, above the groups. */
  home: SidebarLink[];
  content: SidebarLink[];
  appearance: SidebarLink[];
  /** At the foot, or `null` for a role with nothing to set (docs/roles.md). */
  settings: SidebarLink | null;
}

/**
 * What the sidebar links to, for this role, in this language: one answer
 * for the full sidebar and for the strip it folds into, so the two cannot
 * disagree about which screens exist or what they are called.
 *
 * An entry the API would refuse is not drawn (docs/roles.md), rather than
 * refused after the click. The collections a site has defined sit straight
 * under Pages, because that is what they are: pages of one kind, kept
 * apart so neither list drowns the other.
 */
export function useSidebarModel(): SidebarModel {
  const { t } = useTranslation();
  const { can } = useCurrentSession();
  // A plain query, not a suspending one: the sidebar has to be on screen
  // before the collections it may or may not have are known, and a site
  // with none is the normal case.
  const { data: site } = useQuery(siteQueryOptions());
  const { data: collections } = useQuery({
    ...collectionsQueryOptions(site?.id ?? ''),
    enabled: Boolean(site?.id),
  });

  const linksOf = (group: NavGroupId | null): SidebarLink[] =>
    NAV_ENTRIES.filter(
      (entry) =>
        entry.group === group && (!entry.permission || can(entry.permission)),
    ).flatMap((entry): SidebarLink[] => {
      const label = t(entry.labelKey);
      const link: SidebarLink = {
        key: entry.id,
        to: entry.to,
        icon: entry.icon,
        label,
        shortLabel: entry.shortLabelKey ? t(entry.shortLabelKey) : label,
      };
      if (entry.id !== 'pages') return [link];
      return [
        link,
        ...(collections ?? []).map((collection): SidebarLink => ({
          key: `collection-${collection.id}`,
          to: '/collections/$collectionId',
          params: { collectionId: collection.id },
          icon: collectionIcon(collection.icon),
          label: collection.name,
          shortLabel: collection.name,
          isCollection: true,
        })),
      ];
    });

  const offersSettings = can('configureSite') || can('changeLiveSite');
  return {
    home: linksOf(null),
    content: linksOf('content'),
    appearance: linksOf('appearance'),
    settings: offersSettings
      ? {
          key: 'settings',
          to: '/settings',
          icon: Settings,
          label: t('shell.nav.settings'),
          shortLabel: t('shell.nav.short.settings'),
        }
      : null,
  };
}
