import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from '@tanstack/react-router';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { cn } from '../../lib/utils';
import type { FormRecord } from '../../lib/forms-api-client';
import { ConfirmActionDialog } from '../common/confirm-action-dialog';
import { SelectionBar } from '../common/selection-bar';
import { FORMS_PAGE_SIZE } from './forms-queries';
import { Pagination } from '../common/pagination';
import { PromptDialog } from '../common/prompt-dialog';
import { useFormsList } from './use-forms-list';
import { useFormatDate } from '../../lib/use-format-date';
import { PageHeader } from '../shell/page-header';
import { useToast } from '../shell/toast-provider';
import { useCurrentSession } from '../auth/use-current-session';
import { actionErrorMessage } from '../../lib/http-client';
import { InlineError } from '../../components/ui/inline-error';

export interface FormsListViewProps {
  siteId: string;
  forms: FormRecord[];
  page: number;
  total: number;
  /** Open with the "New form" dialog already showing. */
  startCreating?: boolean;
}

/** How many names a question about several forms lists before it says "+ 2". */
const NAMES_SHOWN = 3;

export function FormsListView({
  siteId,
  forms,
  page,
  total,
  startCreating = false,
}: FormsListViewProps) {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  const navigate = useNavigate();
  const { createForm, deleteForm, duplicateForm } = useFormsList(siteId);
  const { toast } = useToast();
  const { can } = useCurrentSession();

  // The forms ticked, in the order they were ticked. Ids of forms that have
  // since left the page linger harmlessly: only the ones on screen count.
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [isNewFormDialogOpen, setIsNewFormDialogOpen] = useState(startCreating);
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [actionError, setActionError] = useState('');

  const selectedForms = forms.filter((form) => selectedIds.includes(form.id));
  const [onlySelected] = selectedForms;
  const totalPages = Math.max(1, Math.ceil(total / FORMS_PAGE_SIZE));

  function toggleSelected(formId: string) {
    setSelectedIds((current) =>
      current.includes(formId)
        ? current.filter((id) => id !== formId)
        : [...current, formId],
    );
    setActionError('');
  }

  async function goToPage(target: number) {
    await navigate({ to: '/forms', search: { page: target } });
  }

  async function handleConfirmDelete() {
    setActionError('');
    // One after another, and only what went through is reported: a form
    // that fails to go leaves the ones behind it ticked, and says why.
    const deleted: FormRecord[] = [];
    try {
      for (const form of selectedForms) {
        await deleteForm(form.id);
        deleted.push(form);
      }
    } catch (err) {
      setActionError(
        actionErrorMessage(
          err,
          t('forms.list.deleteFailed', { count: selectedForms.length }),
        ),
      );
    }
    setIsDeleteDialogOpen(false);
    setSelectedIds((current) =>
      current.filter((id) => !deleted.some((form) => form.id === id)),
    );
    const [first] = deleted;
    if (first) {
      toast(
        deleted.length === 1
          ? t('forms.deleted', { name: first.name })
          : t('forms.deletedMany', { count: deleted.length }),
        'success',
      );
    }
  }

  const submissionsLost = selectedForms.reduce(
    (sum, form) => sum + form.submissionCount,
    0,
  );
  const namesShown = selectedForms
    .slice(0, NAMES_SHOWN)
    .map((form) => `“${form.name}”`)
    .join(', ');
  const namesHidden = selectedForms.length - NAMES_SHOWN;
  const names = namesHidden > 0 ? `${namesShown} + ${namesHidden}` : namesShown;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('forms.list.title')}
        actions={
          /* A form has no draft: it is live once created (docs/roles.md). */
          can('changeLiveSite') && (
            <Button onClick={() => setIsNewFormDialogOpen(true)}>
              {t('forms.list.newForm')}
            </Button>
          )
        }
      />
      {selectedForms.length > 0 && (
        <SelectionBar
          label={t('forms.list.selection.label')}
          countText={t('forms.list.selection.count', {
            count: selectedForms.length,
          })}
          onClear={() => setSelectedIds([])}
        >
          {onlySelected && selectedForms.length === 1 && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/forms/$formId" params={{ formId: onlySelected.id }}>
                <Pencil />
                {t('forms.list.selection.open')}
              </Link>
            </Button>
          )}
          {/* One at a time: the copy is named, and two names are two questions. */}
          {can('changeLiveSite') &&
            onlySelected &&
            selectedForms.length === 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDuplicateDialogOpen(true)}
              >
                <Copy />
                {t('forms.list.selection.duplicate')}
              </Button>
            )}
          {can('delete') && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsDeleteDialogOpen(true)}
            >
              <Trash2 />
              {t('forms.list.selection.delete')}
            </Button>
          )}
        </SelectionBar>
      )}
      {actionError && <InlineError>{actionError}</InlineError>}
      {forms.length === 0 ? (
        // "No form yet." was the whole message, about a thing a client may
        // never have met. It says what one is for, and puts the way to
        // make one right under it — for who may make it.
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
          <p className="text-sm text-muted-foreground">
            {t('forms.list.emptyExplainer')}
          </p>
          {can('changeLiveSite') && (
            <Button
              variant="outline"
              onClick={() => setIsNewFormDialogOpen(true)}
            >
              {t('forms.list.emptyAction')}
            </Button>
          )}
        </div>
      ) : (
        <ul className="divide-y rounded-md border">
          {forms.map((form) => {
            const isSelected = selectedIds.includes(form.id);
            return (
              <li
                key={form.id}
                // The row carries the state, not the box inside it — the
                // same as the pages list.
                className={cn(
                  'relative flex items-start gap-3 px-3 py-2.5 before:absolute before:inset-y-0 before:left-0 before:w-0.75',
                  isSelected
                    ? 'bg-muted before:bg-primary'
                    : 'hover:bg-muted/50 before:bg-transparent',
                )}
              >
                <span className="flex h-5 shrink-0 items-center md:h-6">
                  <Checkbox
                    aria-label={t('forms.list.selectRow', { name: form.name })}
                    checked={isSelected}
                    onCheckedChange={() => toggleSelected(form.id)}
                  />
                </span>
                {/* The name over what it holds on a phone, side by side from
                    `md` up. */}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-center md:justify-between md:gap-3">
                  <Link
                    to="/forms/$formId"
                    params={{ formId: form.id }}
                    className={cn(
                      'truncate text-sm hover:underline focus-visible:underline focus-visible:outline-none',
                      isSelected ? 'font-semibold' : 'font-medium',
                    )}
                  >
                    {form.name}
                  </Link>
                  <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground md:text-sm">
                    <span
                      className={cn(
                        form.submissionCount > 0 &&
                          'font-medium text-foreground',
                      )}
                    >
                      {form.submissionCount > 0
                        ? t('forms.list.submissionCount', {
                            count: form.submissionCount,
                          })
                        : t('forms.list.noSubmissions')}
                    </span>
                    <span aria-hidden>·</span>
                    <span>
                      {t('forms.list.fieldCount', {
                        count: form.fields.length,
                      })}
                    </span>
                    <span aria-hidden>·</span>
                    <span>{formatDate(form.updatedAt)}</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={(target) => void goToPage(target)}
      />
      <PromptDialog
        open={isNewFormDialogOpen}
        onOpenChange={setIsNewFormDialogOpen}
        title={t('forms.newFormDialog.title')}
        label={t('forms.newFormDialog.nameLabel')}
        submitLabel={t('forms.newFormDialog.create')}
        busyLabel={t('forms.newFormDialog.creating')}
        onSubmit={async (name) => {
          const created = await createForm(name);
          toast(t('forms.created', { name: created.name }), 'success');
        }}
      />
      {onlySelected && selectedForms.length === 1 && (
        <PromptDialog
          open={isDuplicateDialogOpen}
          onOpenChange={setIsDuplicateDialogOpen}
          title={t('forms.duplicateDialog.title')}
          label={t('forms.duplicateDialog.nameLabel')}
          initialValue={t('forms.duplicateDialog.copyName', {
            name: onlySelected.name,
          })}
          submitLabel={t('forms.duplicateDialog.submit')}
          busyLabel={t('forms.duplicateDialog.busy')}
          onSubmit={async (name) => {
            const copy = await duplicateForm({ formId: onlySelected.id, name });
            setSelectedIds([]);
            toast(t('forms.duplicated', { name: copy.name }), 'success', {
              label: t('forms.openCopy'),
              onClick: () =>
                void navigate({
                  to: '/forms/$formId',
                  params: { formId: copy.id },
                }),
            });
          }}
        />
      )}
      {selectedForms.length > 0 && (
        <ConfirmActionDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          title={t('forms.deleteDialog.title', {
            count: selectedForms.length,
          })}
          description={[
            t('forms.deleteDialog.description', {
              count: selectedForms.length,
              names,
            }),
            // What goes with a form is said before it goes: its answers are
            // the one thing here that cannot be made again.
            submissionsLost > 0
              ? t('forms.deleteDialog.submissions', { count: submissionsLost })
              : null,
            t('forms.deleteDialog.irreversible'),
          ]
            .filter((sentence) => sentence !== null)
            .join(' ')}
          onConfirm={() => void handleConfirmDelete()}
        />
      )}
    </div>
  );
}
