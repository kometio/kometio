import { type FormField, type FormStep } from '@kometio/shared-types';
import {
  type FormRecord,
  type FormSubmissionRecord,
  type PaginatedFormSubmissions,
  type PaginatedForms,
  type SubmissionOriginPageRecord,
  formRecordSchema,
  paginatedFormSubmissionsSchema,
  paginatedFormsSchema,
} from '@kometio/api-contracts';
import { API_BASE_URL, request, send } from './http-client';

export type {
  FormRecord,
  FormSubmissionRecord,
  PaginatedFormSubmissions,
  PaginatedForms,
  SubmissionOriginPageRecord,
};

export async function listForms(
  siteId: string,
  page: number,
  pageSize: number,
): Promise<PaginatedForms> {
  const params = new URLSearchParams({
    siteId,
    page: String(page),
    pageSize: String(pageSize),
  });
  return paginatedFormsSchema.parse(
    await request(`/forms?${params.toString()}`),
  );
}

export async function getForm(id: string): Promise<FormRecord> {
  return formRecordSchema.parse(await request(`/forms/${id}`));
}

export interface CreateFormInput {
  siteId: string;
  name: string;
}

export async function createForm(input: CreateFormInput): Promise<FormRecord> {
  return formRecordSchema.parse(
    await request('/forms', { method: 'POST', body: JSON.stringify(input) }),
  );
}

/** A copy of a form — its fields, steps and notification addresses, none of its answers — under the name given. */
export async function duplicateForm(
  formId: string,
  name: string,
): Promise<FormRecord> {
  return formRecordSchema.parse(
    await request(`/forms/${formId}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  );
}

export interface UpdateFormInput {
  name: string;
  fields: FormField[];
  steps: FormStep[];
  notificationEmails: string[];
}

export async function updateForm(
  id: string,
  input: UpdateFormInput,
): Promise<FormRecord> {
  return formRecordSchema.parse(
    await request(`/forms/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  );
}

export function deleteForm(id: string): Promise<void> {
  return send(`/forms/${id}`, { method: 'DELETE' });
}

/** One answer, for good — a person's request to be forgotten, for a form that holds many. */
export function deleteFormSubmission(
  formId: string,
  submissionId: string,
): Promise<void> {
  return send(`/forms/${formId}/submissions/${submissionId}`, {
    method: 'DELETE',
  });
}

export async function listFormSubmissions(
  formId: string,
  page: number,
  pageSize: number,
): Promise<PaginatedFormSubmissions> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return paginatedFormSubmissionsSchema.parse(
    await request(`/forms/${formId}/submissions?${params.toString()}`),
  );
}

/**
 * The CSV export's URL rather than its contents: the browser has to fetch
 * it itself for the download to work — `request()` would parse the body as
 * JSON and there would be nothing left to hand to the user.
 *
 * Session auth is a cookie, so a plain link carries it.
 */
export function formSubmissionsCsvUrl(formId: string): string {
  return `${API_BASE_URL}/forms/${formId}/submissions.csv`;
}
