import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { REUSABLE_SECTION_KINDS } from '@kometio/shared-types';
import { useTranslation } from '../../lib/use-translation';
import {
  createReusableSection,
  deleteReusableSection,
  type ReusableSectionKind,
  type ReusableSectionListItem,
} from '../../lib/reusable-sections-api-client';
import { collectionsQueryKey } from '../collections/collections-queries';
import { reusableSectionsQueryOptions } from './reusable-sections-queries';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { TabPanel, Tabs } from '../../components/ui/tabs';
import { ConfirmActionDialog } from '../common/confirm-action-dialog';
import { PromptDialog } from '../common/prompt-dialog';
import { PageHeader } from '../shell/page-header';
import { useToast } from '../shell/toast-provider';
import { useCurrentSession } from '../auth/use-current-session';
import { ApiError, actionErrorMessage } from '../../lib/http-client';

export interface SectionsListViewProps {
  siteId: string;
  /** Which of the two lists is open, from `?kind=` in the address. */
  kind: ReusableSectionKind;
  onKindChange: (kind: ReusableSectionKind) => void;
}

/**
 * The list, and the only place a section is created. Deliberately its own
 * screen rather than a dialog inside the page editor (docs/adr/0059): a
 * shared section is edited on its own, and the way in has to make that
 * obvious rather than making it feel like part of the page you were on.
 *
 * Two lists, because they are two promises: a shared section is one thing
 * shown on many pages, edited once; a template is a starting point that a
 * page copies and then owns. They used to be one list with a "Kind" field
 * on the form that made them, and the answer to "which do I want?" was in
 * a sentence inside a dropdown.
 */
export function SectionsListView({
  siteId,
  kind,
  onKindChange,
}: SectionsListViewProps) {
  const { t } = useTranslation();
  const canDelete = useCurrentSession().can('delete');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryOptions = reusableSectionsQueryOptions(siteId);
  const { data: sections } = useSuspenseQuery(queryOptions);
  const [isCreating, setIsCreating] = useState(false);
  const [sectionToDelete, setSectionToDelete] =
    useState<ReusableSectionListItem | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const shown = sections.filter((section) => section.kind === kind);

  const createMutation = useMutation({
    mutationFn: (name: string) => createReusableSection({ siteId, name, kind }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: queryOptions.queryKey });
      // Straight into the editor: an empty section is not a thing anybody
      // wants to look at in a list.
      void navigate({
        to: '/sections/$sectionId',
        params: { sectionId: created.id },
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (section: ReusableSectionListItem) =>
      deleteReusableSection(section.id),
    onSuccess: (_, section) => {
      void queryClient.invalidateQueries({ queryKey: queryOptions.queryKey });
      // A deleted template may have been a collection's default, which
      // the database has just cleared (docs/adr/0072).
      void queryClient.invalidateQueries({
        queryKey: collectionsQueryKey(siteId),
      });
      toast(t('sections.deleted', { name: section.name }), 'success');
    },
    onError: (caught: unknown) =>
      setDeleteError(actionErrorMessage(caught, t('sections.deleteFailed'))),
  });

  /**
   * What deleting a section does, in words. The count is in the question
   * when there is one: "delete this?" and "delete this, which eight pages
   * are showing?" are different decisions. A template holding it hands out
   * an empty strip to every page made from it afterwards (docs/adr/0072).
   */
  function deleteConsequences(section: ReusableSectionListItem): string {
    const onPages =
      section.usedOnPages > 0
        ? t('sections.deleteDialog.usedOnPages', { count: section.usedOnPages })
        : t('sections.deleteDialog.unused');
    return section.usedInTemplates > 0
      ? `${onPages} ${t('sections.deleteConfirmInTemplates', {
          count: section.usedInTemplates,
        })}`
      : onPages;
  }

  function usageText(
    section: Pick<ReusableSectionListItem, 'usedOnPages' | 'usedInTemplates'>,
  ): string {
    const parts = [
      ...(section.usedOnPages > 0
        ? [t('sections.usedOnPages', { count: section.usedOnPages })]
        : []),
      ...(section.usedInTemplates > 0
        ? [t('sections.usedInTemplates', { count: section.usedInTemplates })]
        : []),
    ];
    return parts.length > 0 ? parts.join(' · ') : t('sections.usedNowhere');
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('sections.title')}
        description={t('sections.subtitle')}
        actions={
          <Button onClick={() => setIsCreating(true)}>
            {t(`sections.new.${kind}`)}
          </Button>
        }
      />
      <Tabs
        id="sections"
        variant="underline"
        label={t('sections.tabs.label')}
        value={kind}
        onChange={onKindChange}
        tabs={REUSABLE_SECTION_KINDS.map((candidate) => ({
          value: candidate,
          label: t(`sections.tabs.${candidate}`),
        }))}
      />
      <TabPanel tabsId="sections" value={kind} className="flex flex-col gap-4">
        {/* Under the tab, what this list is: the two promises are told
            apart here, not in a dropdown on a form. */}
        <p className="text-sm text-muted-foreground">
          {t(`sections.tabDescription.${kind}`)}
        </p>
        {deleteError && (
          <p role="alert" className="text-sm text-destructive">
            {deleteError}
          </p>
        )}
        {shown.length === 0 ? (
          // "No section yet." was the whole message, about a concept a
          // client has never met. It says what one IS now, and makes one.
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
            <p className="text-sm text-muted-foreground">
              {t(`sections.emptyExplainer.${kind}`)}
            </p>
            <Button variant="outline" onClick={() => setIsCreating(true)}>
              {t(`sections.new.${kind}`)}
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {shown.map((section) => (
              <li
                key={section.id}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Link
                      to="/sections/$sectionId"
                      params={{ sectionId: section.id }}
                      className="truncate font-medium hover:underline"
                    >
                      {section.name}
                    </Link>
                    {/* A state, so a state colour, as in the pages list. */}
                    <Badge
                      variant={
                        section.status === 'published' ? 'success' : 'secondary'
                      }
                      className="shrink-0"
                    >
                      {t(`sections.status.${section.status}`)}
                    </Badge>
                  </div>
                  {/* Only for a shared section: inserting a template
                      copies its blocks and leaves nothing pointing back,
                      so there is nothing to count and a "0" there would
                      suggest a link that does not exist. */}
                  {section.kind === 'shared' && (
                    <span className="text-xs text-muted-foreground">
                      {usageText(section)}
                    </span>
                  )}
                  {/* The reason it is not in the page editor's list of
                      templates: only a published one is handed out. */}
                  {section.kind === 'template' &&
                    section.status === 'draft' && (
                      <span className="text-xs text-muted-foreground">
                        {t('sections.templateDraftHint')}
                      </span>
                    )}
                </div>
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    // "Delete" alone, on every row, told a screen reader
                    // nothing about which; it still contains the word on
                    // screen.
                    aria-label={t('sections.deleteNamed', {
                      name: section.name,
                    })}
                    onClick={() => {
                      setDeleteError('');
                      setSectionToDelete(section);
                    }}
                  >
                    <Trash2 />
                    {t('sections.delete')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </TabPanel>
      <PromptDialog
        open={isCreating}
        onOpenChange={setIsCreating}
        title={t(`sections.new.${kind}`)}
        label={t('sections.nameLabel')}
        submitLabel={t('sections.createSubmit')}
        busyLabel={t('sections.creating')}
        onSubmit={(name) => createMutation.mutateAsync(name)}
        // A 409 is the only failure a person can act on here, and the name
        // is the thing they can change.
        errorMessage={(error) =>
          error instanceof ApiError && error.status === 409
            ? t('sections.nameTaken')
            : actionErrorMessage(error, t('sections.createFailed'))
        }
      />
      {sectionToDelete && (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => !open && setSectionToDelete(null)}
          title={t('sections.deleteDialog.title', {
            name: sectionToDelete.name,
          })}
          description={deleteConsequences(sectionToDelete)}
          onConfirm={() => {
            deleteMutation.mutate(sectionToDelete);
            setSectionToDelete(null);
          }}
        />
      )}
    </div>
  );
}
