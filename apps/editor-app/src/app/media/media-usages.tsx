import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { getLocaleDisplayName } from '@kometio/shared-types';
import type { MediaUsage } from '../../lib/media-api-client';
import { Skeleton } from '../../components/ui/skeleton';
import { mediaUsagesQueryOptions } from './media-queries';

/** How many places hold the file — what a delete question says. */
export function usageCount(usage: MediaUsage): number {
  return usage.pages.length + usage.sections.length + usage.layout.length;
}

export interface MediaUsagesProps {
  siteId: string;
  mediaId: string;
}

/**
 * Where the file is in use, each a link to it: the pages, shared sections
 * and header or footer that would be left with a hole if it were deleted.
 * What they hold now, drafts included — not the older versions kept for
 * restoring.
 */
export function MediaUsages({ siteId, mediaId }: MediaUsagesProps) {
  const { t, i18n } = useTranslation();
  const {
    data: usage,
    isPending,
    isError,
  } = useQuery(mediaUsagesQueryOptions(siteId, mediaId));
  const language = (locale: string) =>
    getLocaleDisplayName(locale, i18n.language);

  return (
    <section
      aria-labelledby={`usages-${mediaId}`}
      className="flex flex-col gap-2"
    >
      <h3 id={`usages-${mediaId}`} className="text-sm font-medium">
        {t('media.usages.title')}
      </h3>
      {isPending && <Skeleton className="h-8 w-full" />}
      {isError && (
        <p className="text-xs text-muted-foreground">
          {t('media.usages.failed')}
        </p>
      )}
      {usage && usageCount(usage) === 0 && (
        <p className="text-xs text-muted-foreground">
          {t('media.usages.none')}
        </p>
      )}
      {usage && usageCount(usage) > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {usage.pages.map((page) => (
            <li key={page.pageGroupId} className="flex flex-col">
              <Link
                to="/page-groups/$groupId"
                params={{ groupId: page.pageGroupId }}
                className="w-fit py-0.5 text-primary underline-offset-2 hover:underline"
              >
                {page.title}
              </Link>
              <span className="text-xs text-muted-foreground">
                {t('media.usages.page', {
                  languages: page.locales.map(language).join(', '),
                })}
              </span>
            </li>
          ))}
          {usage.sections.map((section) => (
            <li key={section.sectionId} className="flex flex-col">
              <Link
                to="/sections/$sectionId"
                params={{ sectionId: section.sectionId }}
                className="w-fit py-0.5 text-primary underline-offset-2 hover:underline"
              >
                {section.name}
              </Link>
              <span className="text-xs text-muted-foreground">
                {t(`media.usages.section.${section.kind}`)}
              </span>
            </li>
          ))}
          {usage.layout.map((place) => (
            <li key={`${place.kind}-${place.locale}`} className="flex flex-col">
              <Link
                to={
                  place.kind === 'header' ? '/layout/header' : '/layout/footer'
                }
                search={{ locale: place.locale }}
                className="w-fit py-0.5 text-primary underline-offset-2 hover:underline"
              >
                {t(`media.usages.${place.kind}`)}
              </Link>
              <span className="text-xs text-muted-foreground">
                {language(place.locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
