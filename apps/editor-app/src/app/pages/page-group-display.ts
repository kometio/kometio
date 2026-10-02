import type { PageGroupListItemRecord } from '@kometio/api-contracts';
import { pageStatusBadge, type PageStatusBadge } from './page-status';

/** The default-locale translation's title, falling back to the first available one, then the group id — a group is never created without at least one translation, but a defensive fallback costs nothing. */
export function groupDisplayTitle(
  group: PageGroupListItemRecord,
  defaultLocale: string,
): string {
  return preferredTranslation(group, defaultLocale)?.title || group.id;
}

/**
 * The page's state, read off the translation the row is already showing.
 *
 * Deliberately that one and not "any of them": the row's title, address and
 * date all come from the same translation, so a status taken from a
 * different language would be the one line of the row talking about
 * something else.
 */
export function groupStatusKey(
  group: PageGroupListItemRecord,
  defaultLocale: string,
): PageStatusBadge['key'] {
  return groupStatusBadge(group, defaultLocale).key;
}

/** The same state, with the variant to draw it in. */
export function groupStatusBadge(
  group: PageGroupListItemRecord,
  defaultLocale: string,
): PageStatusBadge {
  const translation = preferredTranslation(group, defaultLocale);
  return pageStatusBadge(
    translation?.status ?? 'draft',
    translation?.hasUnpublishedChanges ?? false,
  );
}

/** The site's own language if this page has it, and whatever it does have if not. */
export function preferredTranslation(
  group: PageGroupListItemRecord,
  defaultLocale: string,
) {
  return (
    group.translations.find(
      (translation) => translation.locale === defaultLocale,
    ) ?? group.translations[0]
  );
}
