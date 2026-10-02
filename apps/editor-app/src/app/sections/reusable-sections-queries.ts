import { queryOptions } from '@tanstack/react-query';
import type { Block } from '@kometio/shared-types';
import {
  getReusableSection,
  listReusableSections,
  listVersions,
  type ReusableSectionListItem,
} from '../../lib/reusable-sections-api-client';

export const reusableSectionsQueryKey = (siteId: string) =>
  ['reusable-sections', siteId] as const;

export function reusableSectionsQueryOptions(siteId: string) {
  return queryOptions({
    queryKey: reusableSectionsQueryKey(siteId),
    queryFn: () => listReusableSections(siteId),
  });
}

export type PublishedTemplate = ReusableSectionListItem & {
  publishedContent: Block[];
};

function isPublishedTemplate(
  section: ReusableSectionListItem,
): section is PublishedTemplate {
  return section.kind === 'template' && section.publishedContent !== null;
}

/**
 * The templates something can be started from — a page, or a strip of
 * one (docs/adr/0059, docs/adr/0072). Published only: what a template
 * hands out is what its author signed off on, and the server refuses a
 * draft anyway. The same cached list as the sections screen, narrowed, so
 * a template saved from a page appears everywhere at once.
 */
export function publishedTemplatesQueryOptions(siteId: string) {
  return queryOptions({
    ...reusableSectionsQueryOptions(siteId),
    select: (sections: ReusableSectionListItem[]) =>
      sections.filter(isPublishedTemplate),
  });
}

/**
 * How many templates exist that the page editor does not hand out because
 * they were never published. The same cached list, counted: it is what
 * lets the templates panel say why a template somebody made is not in it.
 */
export function unpublishedTemplateCountQueryOptions(siteId: string) {
  return queryOptions({
    ...reusableSectionsQueryOptions(siteId),
    select: (sections: ReusableSectionListItem[]) =>
      sections.filter(
        (section) =>
          section.kind === 'template' && section.publishedContent === null,
      ).length,
  });
}

export function reusableSectionQueryOptions(id: string) {
  return queryOptions({
    queryKey: ['reusable-sections', 'detail', id] as const,
    queryFn: () => getReusableSection(id),
  });
}

export function reusableSectionVersionsQueryOptions(id: string) {
  return queryOptions({
    queryKey: ['reusable-sections', 'versions', id] as const,
    queryFn: () => listVersions(id),
  });
}
