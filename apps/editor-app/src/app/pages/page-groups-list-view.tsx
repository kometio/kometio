import { useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { PageGroupListItemRecord } from '@kometio/api-contracts';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { SkeletonRows } from '../../components/ui/skeleton';
import { cn } from '../../lib/utils';
import { computeSiblingReorder } from '../common/compute-sibling-reorder';
import { useDragAnnouncements } from '../common/use-drag-announcements';
import { buildHierarchyTree } from '../common/page-hierarchy';
import { MediaPickerProvider } from '../media/media-picker-provider';
import { MoveToCollectionDialog } from '../collections/move-to-collection-dialog';
import { MoveToParentDialog } from './move-to-parent-dialog';
import { NewPageGroupDialog } from './new-page-group-dialog';
import {
  PagesListFilterBar,
  type PagesListFilterValues,
} from './pages-list-filter-bar';
import { PAGE_GROUPS_PAGE_SIZE } from './page-groups-queries';
import { usePageGroupsList } from './use-page-groups-list';
import { PageHeader } from '../shell/page-header';
import { useToast } from '../shell/toast-provider';
import { useCurrentSession } from '../auth/use-current-session';
import { groupDisplayTitle } from './page-group-display';
import { PageGroupRow } from './page-group-row';
import { DeletePagesDialog } from './delete-pages-dialog';
import { deletionOrder } from './page-deletion';
import { PagesSelectionBar } from './pages-selection-bar';
import {
  initialState,
  pageGroupsListReducer,
  type PageGroupsListState,
} from './page-groups-list-state';
import {
  AUTHOR_COLUMN,
  EDITOR_COLUMN,
  LOCALES_COLUMN,
  PAGE_ROW_INSET,
  SELECT_COLUMN,
  STATUS_COLUMN,
  UPDATED_COLUMN,
} from './page-groups-list-columns';
import { ApiError, actionErrorMessage } from '../../lib/http-client';
import { InlineError } from '../../components/ui/inline-error';
import { Pagination } from '../common/pagination';

export interface PageGroupsListViewProps {
  siteId: string;
  /**
   * `tree` is the site's own pages, in the order somebody dragged them
   * into; `feed` is a collection, flat and newest first. The rows are the
   * same rows — what changes is that a feed has no hierarchy to draw and
   * no order to drag, because its order is the publication date.
   */
  layout?: 'tree' | 'feed';
  /** The collection being listed, so a page created here is created in it. */
  collectionId?: string | null;
  /** Shown as the screen's heading — a collection is named by whoever made it. */
  title?: string;
  defaultLocale: string;
  enabledLocales: string[];
  groups: PageGroupListItemRecord[];
  page: number;
  total: number;
  filters: PagesListFilterValues;
  onFiltersChange: (next: PagesListFilterValues) => void;
  /** Open with the "New page" dialog already showing. */
  startCreating?: boolean;
  /** The list is being asked for again (a filter changed): the old rows give way to a placeholder, not to a table that no longer matches what is above it. */
  isRefreshing?: boolean;
}

/**
 * i18n a livello di campo (see the plan) — pages-list-view.tsx's
 * counterpart for the new PageGroup model: one row per group (not per
 * locale), with per-locale availability badges instead of a single locale
 * badge, plus the filter bar. Drag-reorder and duplicate are wired up
 * (Fase 4's last two tracked follow-ups); where a page hangs is chosen at
 * creation and changed with "Move in the tree" (docs/adr/0074).
 */
export function PageGroupsListView({
  siteId,
  layout = 'tree',
  collectionId = null,
  title,
  defaultLocale,
  enabledLocales,
  groups,
  page,
  total,
  filters,
  onFiltersChange,
  startCreating = false,
  isRefreshing = false,
}: PageGroupsListViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    createPageGroup,
    deletePageGroup,
    duplicatePageGroup,
    isDuplicating,
    moveToCollection,
    isMoving,
    moveToParent,
    isMovingToParent,
    reorderPageGroups,
  } = usePageGroupsList(siteId, defaultLocale, collectionId);
  // A feed has no hierarchy to build: every row sits at depth zero, which
  // is also what makes the tree guides draw nothing.
  const tree =
    layout === 'feed'
      ? groups.map((item) => ({
          item,
          depth: 0,
          isLast: true,
          ancestorIsLast: [] as readonly boolean[],
        }))
      : buildHierarchyTree(groups);

  const [state, dispatch] = useReducer(
    pageGroupsListReducer,
    initialState,
    (initial): PageGroupsListState =>
      startCreating ? { ...initial, openDialog: 'new' } : initial,
  );
  const { selectedGroupIds, openDialog, actionError } = state;
  // The pages ticked that are still on screen, in the order of the list.
  const selectedGroups = groups.filter((g) => selectedGroupIds.includes(g.id));
  const selectedCount = selectedGroups.length;
  const onlySelected = selectedGroups.length === 1 ? selectedGroups[0] : null;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_GROUPS_PAGE_SIZE));
  const hasNoFilters = Object.values(filters).every((v) => v === '');
  /*
   * Whether either author column has anything to show on THIS page of
   * results. Measured live: one row in sixteen carried a name, and the two
   * columns between them took a third of the width to print an em dash.
   * Per page rather than per site, because that is the question the header
   * is answering — "is there an author to read here".
   */
  const showCreatedBy = groups.some((group) => group.createdByName);
  const showLastEditedBy = groups.some((group) => group.lastEditedByName);
  // A feed is never draggable: its order is the publication date, and a
  // handle offering to change it would be lying.
  // A page's place in the tree, its collection and its order show online
  // without a publish, so they are a publisher's, like deleting it
  // (docs/roles.md).
  const { can } = useCurrentSession();
  const changesLiveSite = can('changeLiveSite');
  const canReorder =
    changesLiveSite && layout === 'tree' && hasNoFilters && totalPages <= 1;
  // Said, instead of the handles simply not being there: a person who
  // reorders pages and finds no handle is left to guess why.
  const reorderIsOffBecause =
    changesLiveSite && layout === 'tree' && !canReorder && groups.length > 1
      ? hasNoFilters
        ? 'paged'
        : 'filtered'
      : null;

  // Same click-vs-drag distinction as canvas/layers-panel.tsx: without an
  // activation distance, dnd-kit would capture the pointer on a plain
  // click too, breaking the row's own select button.
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const dragAccessibility = useDragAnnouncements((id) => {
    const group = groups.find((candidate) => candidate.id === id);
    return group ? groupDisplayTitle(group, defaultLocale) : String(id);
  });

  function toggleSelected(groupId: string) {
    dispatch({ type: 'TOGGLE_SELECTED', groupId });
  }

  function closeDialog() {
    dispatch({ type: 'CLOSE_DIALOG' });
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!canReorder) return;
    const result = computeSiblingReorder(
      groups,
      String(event.active.id),
      event.over ? String(event.over.id) : null,
    );
    if (result) {
      void reorderPageGroups(result.parentId, result.orderedIds).catch((err) =>
        dispatch({
          type: 'SET_ERROR',
          error: actionErrorMessage(err, t('pages.list.reorderFailed')),
        }),
      );
    }
  }

  async function goToPage(target: number) {
    // Back to the screen this list IS, not to Pages: a collection's own list
    // sent you to the generic page tree as soon as it grew past one page
    // of results, which read as the collection having lost its contents.
    //
    // Over what the address holds, not instead of it: the filters are in it,
    // and the next page of a filtered list is the next page of THAT list.
    await (collectionId
      ? navigate({
          to: '/collections/$collectionId',
          params: { collectionId },
          search: (current) => ({ ...current, page: target }),
        })
      : navigate({
          to: '/pages',
          search: (current) => ({ ...current, page: target }),
        }));
  }

  async function handleOpenEditor(groupId: string) {
    await navigate({ to: '/page-groups/$groupId', params: { groupId } });
  }

  // Each of the actions below is asked of the pages one after the other:
  // the API takes one page at a time, and a failure stops the run where it
  // happened, with the pages before it already done — said in the toast
  // only when all of them were.
  async function handleDuplicate() {
    dispatch({ type: 'SET_ERROR', error: '' });
    try {
      const copies = [];
      for (const group of selectedGroups) {
        copies.push(await duplicatePageGroup(group.id));
      }
      const [first] = copies;
      toast(
        t('pages.list.duplicated', { count: copies.length }),
        'success',
        // A copy stays in the list, where the next thing to do is often
        // another; the way to it is offered, not taken.
        copies.length === 1 && first
          ? {
              label: t('pages.list.openCopy'),
              onClick: () => void handleOpenEditor(first.id),
            }
          : undefined,
      );
      dispatch({ type: 'CLEAR_SELECTION' });
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        error: actionErrorMessage(err, t('pages.list.duplicateFailed')),
      });
    }
  }

  async function handleMoveToCollection(targetCollectionId: string | null) {
    const moved = selectedGroups.length;
    for (const group of selectedGroups) {
      await moveToCollection(group.id, targetCollectionId);
    }
    toast(t('pages.list.moved', { count: moved }), 'success');
    dispatch({ type: 'CLEAR_SELECTION' });
  }

  async function handleMoveUnder(targetParentId: string | null) {
    if (!onlySelected) return;
    await moveToParent(onlySelected.id, targetParentId);
    toast(t('pages.list.moved', { count: 1 }), 'success');
    dispatch({ type: 'CLEAR_SELECTION' });
  }

  async function handleConfirmDelete() {
    dispatch({ type: 'SET_ERROR', error: '' });
    // The ticked subpages first, the deepest first: what is ticked under a
    // page is gone before the page's turn, and what is not ticked moves up.
    const order = deletionOrder(selectedGroups, groups);
    try {
      for (const group of order) {
        await deletePageGroup(group.id);
      }
      toast(t('pages.list.deleted', { count: order.length }), 'success');
      dispatch({ type: 'CLEAR_SELECTION' });
    } catch (err) {
      // The API moves subpages up before deleting, so this is only a subpage
      // added a moment ago: the answer is a code, said here in words. A
      // subpage whose address is taken at the top level comes back with its
      // own sentence, which names it.
      const hasChildren =
        err instanceof ApiError &&
        err.status === 409 &&
        err.displayMessage === 'page-has-children';
      dispatch({
        type: 'SET_ERROR',
        error: hasChildren
          ? t('pages.deleteDialog.hasChildren')
          : actionErrorMessage(err, t('pages.list.deleteFailed')),
      });
    }
  }

  const allSelected = groups.length > 0 && selectedCount === groups.length;

  return (
    <MediaPickerProvider siteId={siteId}>
      <div className="flex flex-col gap-4">
        <PageHeader
          title={title ?? t('pages.list.title')}
          actions={
            <Button
              onClick={() => dispatch({ type: 'OPEN_DIALOG', dialog: 'new' })}
            >
              {t('pages.list.newPage')}
            </Button>
          }
        />
        <PagesListFilterBar
          value={filters}
          onChange={onFiltersChange}
          enabledLocales={enabledLocales}
        />
        {selectedCount > 0 && (
          <PagesSelectionBar
            count={selectedCount}
            isBusy={isDuplicating}
            onClear={() => dispatch({ type: 'CLEAR_SELECTION' })}
            onOpen={() =>
              onlySelected && void handleOpenEditor(onlySelected.id)
            }
            onDuplicate={() => void handleDuplicate()}
            onMoveToCollection={
              changesLiveSite
                ? () => dispatch({ type: 'OPEN_DIALOG', dialog: 'move' })
                : undefined
            }
            onMoveUnder={
              changesLiveSite
                ? () =>
                    dispatch({ type: 'OPEN_DIALOG', dialog: 'move-to-parent' })
                : undefined
            }
            onDelete={
              can('delete')
                ? () => dispatch({ type: 'OPEN_DIALOG', dialog: 'delete' })
                : undefined
            }
          />
        )}
        {actionError && <InlineError>{actionError}</InlineError>}
        {reorderIsOffBecause && (
          <p className="text-xs text-muted-foreground">
            {t(
              reorderIsOffBecause === 'filtered'
                ? 'pages.list.reorderOffFiltered'
                : 'pages.list.reorderOffPaged',
            )}
          </p>
        )}
        {isRefreshing ? (
          <SkeletonRows rows={6} label={t('common.loading')} />
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {hasNoFilters ? t('pages.list.empty') : t('pages.list.noMatches')}
          </p>
        ) : (
          <DndContext
            sensors={dragSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            accessibility={dragAccessibility}
          >
            <SortableContext
              items={tree.map(({ item }) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              {/* One box around the header and the rows: they are one
                  table, and as two bordered siblings the column names
                  floated a gap away from the first row they named. */}
              <div className="overflow-hidden rounded-md border">
                {/* A header, because the list has columns and was not
                    saying so: a title, a row of language badges, a name
                    and a date read as one crowded line until they were
                    named. */}
                <div className="flex h-9 items-center gap-2 border-b bg-muted/40 pr-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <span
                    className="flex min-w-0 flex-1 items-center gap-2"
                    style={{ paddingLeft: PAGE_ROW_INSET }}
                  >
                    <span
                      className={cn(
                        'flex shrink-0 justify-center',
                        SELECT_COLUMN,
                      )}
                    >
                      <Checkbox
                        aria-label={t('pages.list.selectAll')}
                        checked={
                          allSelected
                            ? true
                            : selectedCount > 0
                              ? 'indeterminate'
                              : false
                        }
                        onCheckedChange={() =>
                          dispatch(
                            allSelected
                              ? { type: 'CLEAR_SELECTION' }
                              : {
                                  type: 'SELECT_ALL',
                                  groupIds: groups.map((group) => group.id),
                                },
                          )
                        }
                      />
                    </span>
                    <span className="flex min-w-0 flex-1 gap-3">
                      <span className="min-w-0 flex-1 truncate">
                        {t('pages.list.colTitle')}
                      </span>
                      <span className={cn('shrink-0', LOCALES_COLUMN)}>
                        {t('pages.list.colLanguages')}
                      </span>
                      <span className={cn('truncate', STATUS_COLUMN)}>
                        {t('pages.list.colStatus')}
                      </span>
                      {showCreatedBy && (
                        <span className={cn('truncate', AUTHOR_COLUMN)}>
                          {t('pages.list.colAuthor')}
                        </span>
                      )}
                      {showLastEditedBy && (
                        <span className={cn('truncate', EDITOR_COLUMN)}>
                          {t('pages.list.colEditor')}
                        </span>
                      )}
                      <span className={cn('truncate', UPDATED_COLUMN)}>
                        {t('pages.list.colUpdated')}
                      </span>
                    </span>
                  </span>
                </div>
                <ul className="divide-y">
                  {tree.map(
                    ({ item: group, depth, isLast, ancestorIsLast }) => (
                      <PageGroupRow
                        key={group.id}
                        group={group}
                        depth={depth}
                        isLast={isLast}
                        ancestorIsLast={ancestorIsLast}
                        isSelected={selectedGroupIds.includes(group.id)}
                        defaultLocale={defaultLocale}
                        enabledLocales={enabledLocales}
                        draggable={canReorder}
                        showCreatedBy={showCreatedBy}
                        showLastEditedBy={showLastEditedBy}
                        onToggleSelected={() => toggleSelected(group.id)}
                      />
                    ),
                  )}
                </ul>
              </div>
            </SortableContext>
          </DndContext>
        )}
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={(target) => void goToPage(target)}
        />
        <NewPageGroupDialog
          siteId={siteId}
          defaultLocale={defaultLocale}
          collectionId={collectionId}
          open={openDialog === 'new'}
          onOpenChange={(open) => !open && closeDialog()}
          onCreate={createPageGroup}
        />
        {selectedCount > 0 && (
          <MoveToCollectionDialog
            siteId={siteId}
            open={openDialog === 'move'}
            onOpenChange={(open) => !open && closeDialog()}
            pageTitle={
              onlySelected
                ? groupDisplayTitle(onlySelected, defaultLocale)
                : t('pages.list.selection.count', { count: selectedCount })
            }
            currentCollectionId={
              // Where they are filed today, when they are all in one place.
              selectedGroups.every(
                (group) =>
                  (group.collectionId ?? null) ===
                  (selectedGroups[0]?.collectionId ?? null),
              )
                ? (selectedGroups[0]?.collectionId ?? null)
                : null
            }
            onMove={handleMoveToCollection}
            isMoving={isMoving}
          />
        )}
        {onlySelected && (
          <MoveToParentDialog
            siteId={siteId}
            defaultLocale={defaultLocale}
            open={openDialog === 'move-to-parent'}
            onOpenChange={(open) => !open && closeDialog()}
            pageTitle={groupDisplayTitle(onlySelected, defaultLocale)}
            pageGroupId={onlySelected.id}
            currentParentId={onlySelected.parentId ?? null}
            onMove={handleMoveUnder}
            isMoving={isMovingToParent}
          />
        )}
        {selectedCount > 0 && (
          <DeletePagesDialog
            open={openDialog === 'delete'}
            onOpenChange={(open) => !open && closeDialog()}
            selected={selectedGroups}
            all={groups}
            defaultLocale={defaultLocale}
            onConfirm={() => void handleConfirmDelete()}
          />
        )}
      </div>
    </MediaPickerProvider>
  );
}
