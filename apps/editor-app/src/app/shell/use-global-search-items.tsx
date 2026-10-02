import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ClipboardList, FileText, Image } from 'lucide-react';
import type { CommandItem } from '../common/command-menu';
import { useDebouncedValue } from '../common/use-debounced-value';
import { collectionsQueryOptions } from '../collections/collections-queries';
import { formsQueryOptions } from '../forms/forms-queries';
import { mediaQueryOptions } from '../media/media-queries';
import {
  groupDisplayTitle,
  groupStatusKey,
  preferredTranslation,
} from '../pages/page-group-display';
import { pageGroupsQueryOptions } from '../pages/page-groups-queries';
import { siteQueryOptions } from '../settings/site-queries';
import {
  useActionEntries,
  useGoEntries,
  usePreferenceEntries,
} from './use-global-search-entries';

/** Fewer than this and a search is a guess: one letter matches half the site. */
const MIN_QUERY_LENGTH = 2;
/** The server's answers are a taste, not a list: the screen for each thing has the rest. */
const RESULTS_PER_GROUP = 5;
/** Long enough that a word being typed is one search, short enough that it does not feel slow. */
const DEBOUNCE_MS = 200;

export interface GlobalSearchState {
  items: CommandItem[];
  /** An answer is still on its way: the list says so, instead of "no results". */
  loading: boolean;
}

/**
 * What the shell's search lists for what is typed.
 *
 * Two kinds of entry. The ones that need nothing from the server — where
 * to go, what to do, what to change about the editor — are always there
 * and are filtered as you type. The ones that are the site's own content
 * (pages, files, forms) are asked of the server through the same queries
 * the screens use, only once there are two characters, and only after the
 * typing pauses, so a word is one search and not five.
 *
 * Nothing is asked while it is closed: the sidebar holds this on every
 * screen, and a search nobody opened has no business fetching the site's
 * files.
 */
export function useGlobalSearchItems({
  open,
  query,
}: {
  open: boolean;
  query: string;
}): GlobalSearchState {
  const { t } = useTranslation();
  const { data: site } = useQuery({ ...siteQueryOptions(), enabled: open });
  const siteId = site?.id ?? '';
  const defaultLocale = site?.defaultLocale ?? '';
  const { data: collections } = useQuery({
    ...collectionsQueryOptions(siteId),
    enabled: open && siteId !== '',
  });

  const typed = query.trim();
  const debounced = useDebouncedValue(typed, DEBOUNCE_MS);
  const isSearching =
    open && siteId !== '' && debounced.length >= MIN_QUERY_LENGTH;
  const pages = useQuery({
    ...pageGroupsQueryOptions(siteId, 1, { search: debounced }),
    enabled: isSearching,
  });
  const media = useQuery({
    ...mediaQueryOptions(siteId, 1, { search: debounced }),
    enabled: isSearching,
  });
  // The forms have no server-side search: the first page is asked for, and
  // filtered by name here. That is enough while a site has fewer than a
  // page of them; a search parameter on the endpoint is the day it is not.
  const forms = useQuery({
    ...formsQueryOptions(siteId, 1),
    enabled: isSearching,
  });

  const found: CommandItem[] = isSearching
    ? [
        ...(pages.data?.items ?? [])
          .slice(0, RESULTS_PER_GROUP)
          .map((group): CommandItem => {
            const slug = preferredTranslation(group, defaultLocale)?.slug ?? '';
            return {
              id: `page:${group.id}`,
              group: 'pages',
              label: groupDisplayTitle(group, defaultLocale),
              // The address is searched too: it is how a page is often known.
              keywords: slug,
              detail: `/${slug} · ${t(groupStatusKey(group, defaultLocale))}`,
              icon: <FileText />,
            };
          }),
        ...(media.data?.items ?? [])
          .slice(0, RESULTS_PER_GROUP)
          .map((file): CommandItem => ({
            id: `media:${file.id}`,
            group: 'media',
            label: file.filename,
            icon: <Image />,
          })),
        ...(forms.data?.items ?? [])
          .filter((form) =>
            form.name.toLowerCase().includes(debounced.toLowerCase()),
          )
          .slice(0, RESULTS_PER_GROUP)
          .map((form): CommandItem => ({
            id: `form:${form.id}`,
            group: 'forms',
            label: form.name,
            icon: <ClipboardList />,
          })),
      ]
    : [];

  const go = useGoEntries(collections ?? []);
  const actions = useActionEntries();
  const preferences = usePreferenceEntries();
  const items = [...go, ...actions, ...preferences, ...found];

  // Still typing (the debounce has not caught up) or still asking.
  const loading =
    open &&
    typed.length >= MIN_QUERY_LENGTH &&
    (typed !== debounced ||
      pages.isFetching ||
      media.isFetching ||
      forms.isFetching);

  return { items, loading };
}
