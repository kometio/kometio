import { queryOptions } from '@tanstack/react-query';
import {
  getForm,
  listForms,
  listFormSubmissions,
} from '../../lib/forms-api-client';

export const FORMS_PAGE_SIZE = 20;

export function formsQueryOptions(siteId: string, page: number) {
  return queryOptions({
    queryKey: ['forms', siteId, page, FORMS_PAGE_SIZE] as const,
    queryFn: () => listForms(siteId, page, FORMS_PAGE_SIZE),
  });
}

export function formQueryOptions(formId: string) {
  return queryOptions({
    queryKey: ['forms', 'detail', formId] as const,
    queryFn: () => getForm(formId),
  });
}

export const FORM_SUBMISSIONS_PAGE_SIZE = 20;

export function formSubmissionsQueryOptions(formId: string, page: number) {
  return queryOptions({
    queryKey: [
      'forms',
      'submissions',
      formId,
      page,
      FORM_SUBMISSIONS_PAGE_SIZE,
    ] as const,
    queryFn: () =>
      listFormSubmissions(formId, page, FORM_SUBMISSIONS_PAGE_SIZE),
  });
}
