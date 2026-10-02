import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Download, Trash2 } from 'lucide-react';
import type { FormField } from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import { Link } from '@tanstack/react-router';
import { Pagination } from '../common/pagination';
import { SubmissionsRetentionNote } from './submissions-retention-note';
import type {
  FormSubmissionRecord,
  SubmissionOriginPageRecord,
} from '../../lib/forms-api-client';
import {
  deleteFormSubmission,
  formSubmissionsCsvUrl,
} from '../../lib/forms-api-client';
import { actionErrorMessage } from '../../lib/http-client';
import { ConfirmActionDialog } from '../common/confirm-action-dialog';
import { useCurrentSession } from '../auth/use-current-session';
import { useToast } from '../shell/toast-provider';
import {
  FORM_SUBMISSIONS_PAGE_SIZE,
  formSubmissionsQueryOptions,
} from './forms-queries';
import { SkeletonRows } from '../../components/ui/skeleton';
import { InlineError } from '../../components/ui/inline-error';
import { useFormatDate } from '../../lib/use-format-date';
import { ListItemButton } from '../../components/ui/list-item-button';

/** A file answer's stored shape — `{ url, filename }`, not a string. */
const fileAnswerSchema = z.object({
  url: z.string(),
  // A name that is not text is no name, not a reason to lose the file.
  filename: z.string().optional().catch(undefined),
});

function asFile(value: unknown): { url: string; filename?: string } | null {
  const parsed = fileAnswerSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * An answer as one line of text, for the collapsed row's preview. It has
 * to go through the same shapes `AnswerValue` handles: a file answer put
 * through `String()` reads "[object Object]", which is the same trap the
 * notification email and the CSV export each hit once.
 */
function previewText(value: unknown): string | null {
  const file = asFile(value);
  if (file) return file.filename ?? file.url;
  if (typeof value === 'boolean') return null;
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

/**
 * One answer, in whatever shape the field's type stored it. A booleanish
 * checkbox reads as yes/no rather than `true`, and a blank reads as a dash
 * rather than as nothing at all — an empty cell is ambiguous between "left
 * blank" and "the UI failed to render it".
 */
function AnswerValue({ value }: { value: unknown }) {
  const { t } = useTranslation();
  const file = asFile(value);

  if (file) {
    return (
      <a
        href={file.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 underline"
      >
        <Download className="size-3.5" aria-hidden="true" />
        {file.filename ?? t('forms.submissions.downloadFile')}
      </a>
    );
  }
  if (typeof value === 'boolean') {
    return value ? t('common.yes') : t('common.no');
  }
  if (value === null || value === undefined || value === '') {
    return (
      <span className="text-muted-foreground">
        {t('forms.submissions.noAnswer')}
      </span>
    );
  }
  return <span className="whitespace-pre-wrap">{String(value)}</span>;
}

interface SubmissionRowProps {
  submission: FormSubmissionRecord;
  fields: FormField[];
  /** The list's own formatter: one for the whole list, not one per row. */
  formatDateTime: (value: string) => string | null;
  /** The page it was filled on, already looked up — `null` when there is none to show. */
  page: SubmissionOriginPageRecord | null;
  /** Asks to delete this answer — absent for a role that may not delete. */
  onDelete?: () => void;
}

function SubmissionRow({
  submission,
  fields,
  formatDateTime,
  page,
  onDelete,
}: SubmissionRowProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const knownIds = fields.map((field) => field.id);
  // Answers to fields the form no longer has. They are real things someone
  // typed, so they are shown — labelled by their raw key, which is the only
  // name left for them, and marked so nobody mistakes one for a live field.
  const orphanKeys = Object.keys(submission.payload).filter(
    (key) => !knownIds.includes(key),
  );

  const preview = fields
    .slice(0, 2)
    .map((field) => previewText(submission.payload[field.id]))
    .filter((text): text is string => text !== null)
    .join(' · ');

  return (
    <li className="border-border border-b last:border-b-0">
      <ListItemButton
        inset="row"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
        className="justify-start"
      >
        {open ? (
          <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
        )}
        <time
          dateTime={submission.createdAt}
          className="text-muted-foreground w-40 shrink-0 text-xs tabular-nums"
        >
          {formatDateTime(submission.createdAt)}
        </time>
        <span className="truncate text-sm">
          {preview || t('forms.submissions.noAnswer')}
        </span>
        {page && (
          // Plain text here and a link below: this header is itself a
          // button, and a link inside a button is neither valid markup
          // nor operable with a keyboard.
          <span className="text-muted-foreground ml-auto hidden shrink-0 truncate pl-3 text-xs sm:inline">
            {page.title}
          </span>
        )}
        <span className="sr-only">
          {open
            ? t('forms.submissions.collapse')
            : t('forms.submissions.expand')}
        </span>
      </ListItemButton>

      {open && (
        <dl className="grid gap-x-4 gap-y-2 px-3 pb-4 pl-10 text-sm sm:grid-cols-[12rem_1fr]">
          {/* Before the answers, and visibly not one of them: where it was
              filled is a fact about the submission, not something the
              visitor typed. */}
          {page && (
            <div className="contents">
              <dt className="text-muted-foreground">
                {t('forms.submissions.submittedFrom')}
              </dt>
              <dd>
                <Link
                  to="/page-groups/$groupId"
                  params={{ groupId: page.pageGroupId }}
                  className="underline"
                >
                  {page.title}
                </Link>{' '}
                <span className="text-muted-foreground text-xs uppercase">
                  {page.locale}
                </span>
              </dd>
            </div>
          )}
          {fields.map((field) => (
            <div key={field.id} className="contents">
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd>
                <AnswerValue value={submission.payload[field.id]} />
              </dd>
            </div>
          ))}
          {orphanKeys.map((key) => (
            <div key={key} className="contents">
              <dt className="text-muted-foreground">
                {key}{' '}
                <span className="text-xs italic">
                  ({t('forms.submissions.removedField')})
                </span>
              </dt>
              <dd>
                <AnswerValue value={submission.payload[key]} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {open && onDelete && (
        // Inside the opened answer, where it is plain which one it is: one
        // button per collapsed row would be twenty bins in a list.
        <div className="px-3 pb-4 pl-10">
          <Button type="button" variant="outline" size="sm" onClick={onDelete}>
            <Trash2 />
            {t('forms.submissions.delete')}
          </Button>
        </div>
      )}
    </li>
  );
}

export interface FormSubmissionsListProps {
  formId: string;
  /** Which page is shown, from 1 — kept in the address by the screen, so a page of answers can be reloaded and linked to. */
  page: number;
  onPageChange: (page: number) => void;
}

/**
 * What was actually submitted to this form. Lives inside the form's own
 * editor because a payload is keyed by field id and means nothing without
 * that form's field definitions to read it against.
 *
 * A list of expandable rows rather than a table with a column per field:
 * a three-field contact form would read fine as a table, a fifteen-field
 * one would not, and neither shape has anywhere to put an answer to a
 * field that has since been removed.
 */
export function FormSubmissionsList({
  formId,
  page,
  onPageChange,
}: FormSubmissionsListProps) {
  const { t } = useTranslation();
  const formatDateTime = useFormatDate('dateTime');
  const { data, isPending, isError } = useQuery(
    formSubmissionsQueryOptions(formId, page),
  );
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const canDelete = useCurrentSession().can('delete');
  const [pendingDeletion, setPendingDeletion] =
    useState<FormSubmissionRecord | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const remove = useMutation({
    mutationFn: (submission: FormSubmissionRecord) =>
      deleteFormSubmission(formId, submission.id),
    // The list, its count and the forms' own counts all move.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['forms'] }),
  });

  if (isPending) {
    return <SkeletonRows />;
  }
  if (isError) {
    return <InlineError>{t('forms.submissions.loadError')}</InlineError>;
  }

  const lastPage = Math.max(
    1,
    Math.ceil(data.total / FORM_SUBMISSIONS_PAGE_SIZE),
  );
  const pagesById = new Map(data.pages.map((page) => [page.id, page]));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h2 className="text-base font-semibold">
            {t('forms.submissions.title')}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t('forms.submissions.count', { count: data.total })}
          </p>
        </div>
        {data.total > 0 && (
          <Button asChild variant="outline" size="sm">
            {/* A real link, not a fetch: the browser has to do the request
                itself for the save dialog to appear. The session cookie
                goes with it. */}
            <a href={formSubmissionsCsvUrl(formId)} download>
              <Download />
              {t('forms.submissions.exportCsv')}
            </a>
          </Button>
        )}
      </div>

      <SubmissionsRetentionNote />
      {deleteError && <InlineError>{deleteError}</InlineError>}

      {data.total === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
          {t('forms.submissions.empty')}
        </p>
      ) : (
        <ul className="border-border overflow-hidden rounded-md border">
          {data.items.map((submission) => (
            <SubmissionRow
              key={submission.id}
              submission={submission}
              fields={data.fields}
              formatDateTime={formatDateTime}
              page={
                (submission.pageId && pagesById.get(submission.pageId)) || null
              }
              onDelete={
                canDelete
                  ? () => {
                      setDeleteError('');
                      setPendingDeletion(submission);
                    }
                  : undefined
              }
            />
          ))}
        </ul>
      )}

      <Pagination
        page={page}
        totalPages={lastPage}
        onPageChange={onPageChange}
      />
      {pendingDeletion && (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => !open && setPendingDeletion(null)}
          title={t('forms.submissions.deleteDialog.title')}
          description={t('forms.submissions.deleteDialog.description', {
            date: formatDateTime(pendingDeletion.createdAt),
          })}
          onConfirm={() => {
            const submission = pendingDeletion;
            setPendingDeletion(null);
            remove.mutate(submission, {
              onSuccess: () => toast(t('forms.submissions.deleted'), 'success'),
              onError: (err) =>
                setDeleteError(
                  actionErrorMessage(err, t('forms.submissions.deleteFailed')),
                ),
            });
          }}
        />
      )}
    </div>
  );
}
