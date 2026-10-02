import { useQuery } from '@tanstack/react-query';
import { siteQueryOptions } from '../settings/site-queries';

/**
 * Which filesystem theme this site currently renders with
 * (`Site.themeName`, docs/adr/0042) — every theme-* query needs it, since
 * apps/public-site now serves icons/tokens/blocks per theme rather than
 * for one build-time-fixed theme. Empty string while the site query is
 * still in flight; each of those queries stays disabled until then rather
 * than fetching the wrong theme's data and refetching a moment later.
 *
 * A hook rather than a prop threaded through the six consumers: four of
 * them (IconListProvider, IconPickerDialog, usePageBlockRegistry,
 * BlockToolbarOverlay) have no `siteId` in scope at all, and reaching one
 * down to them would mean prop-drilling through the whole canvas tree.
 */
export function useActiveThemeName(): string {
  const { data: site } = useQuery(siteQueryOptions());
  return site?.themeName ?? '';
}
