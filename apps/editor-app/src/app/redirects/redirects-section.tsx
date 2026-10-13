import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search, Trash2, Upload } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { InlineError } from '../../components/ui/inline-error';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { OptionsSelect } from '../../components/ui/select';
import { SkeletonRows } from '../../components/ui/skeleton';
import { TabPanel, Tabs } from '../../components/ui/tabs';
import { actionErrorMessage } from '../../lib/http-client';
import type {
  RedirectImportReport,
  RedirectRecord,
} from '../../lib/redirects-api-client';
import { useCurrentSession } from '../auth/use-current-session';
import { ConfirmActionDialog } from '../common/confirm-action-dialog';
import { Pagination } from '../common/pagination';
import { SelectionBar } from '../common/selection-bar';
import { useDebouncedValue } from '../common/use-debounced-value';
import { SettingsSectionHeader } from '../settings/settings-section';
import { useToast } from '../shell/toast-provider';
import { ImportRedirectsDialog } from './import-redirects-dialog';
import { MissingPathsPanel } from './missing-paths-panel';
import { RedirectDialog } from './redirect-dialog';
import { RedirectRow } from './redirect-row';
import {
  filtersFor,
  missingPathsQueryOptions,
  REDIRECTS_PAGE_SIZE,
  redirectsQueryOptions,
} from './redirects-queries';
import {
  REDIRECT_FILTERS,
  type RedirectFilter,
  type RedirectsSearch,
  type RedirectTab,
} from './redirects-search';
import { TestRedirectDialog } from './test-redirect-dialog';
import { useRedirects } from './use-redirects';

/** How many addresses a question about several rules lists before it says "+ 2". */
const NAMES_SHOWN = 3;

/** How long the typing has to pause before the search is written into the address and asked of the server. */
const SEARCH_DEBOUNCE_MS = 300;

export interface RedirectsSectionProps {
  siteId: string;
  defaultLocale: string;
  enabledLocales: readonly string[];
  /** What is on screen, from the address. */
  search: RedirectsSearch;
  /** `replace`: the change is not a place to come back to (a tab, a filter, a search). */
  onSearchChange: (
    next: RedirectsSearch,
    options?: { replace?: boolean },
  ) => void;
}

type Editor =
  { kind: 'add'; from: string } | { kind: 'edit'; redirect: RedirectRecord };

function isFilter(value: string): value is RedirectFilter {
  return REDIRECT_FILTERS.some((filter) => filter === value);
}

/**
 * The redirects of the site, in the settings: the rules, and what visitors
 * asked for that the site did not have.
 *
 * Meant for somebody who has just moved a site and is afraid of losing what
 * search engines know about it: the empty screen says what to do first, the
 * "Not found" list says what is still being asked for, and any address can
 * be checked before and after, with an answer in words.
 */
export function RedirectsSection({
  siteId,
  defaultLocale,
  enabledLocales,
  search,
  onSearchChange,
}: RedirectsSectionProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { can } = useCurrentSession();
  const {
    createRedirect,
    updateRedirect,
    deleteRedirect,
    importList,
    refresh,
  } = useRedirects(siteId);

  const [editor, setEditor] = useState<Editor | null>(null);
  const [importing, setImporting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [actionError, setActionError] = useState('');

  function go(patch: Partial<RedirectsSearch>, replace = false) {
    onSearchChange({ ...search, ...patch }, { replace });
  }

  // The text is what the person sees; the address follows it once it has
  // paused, and goes back to the first page (page 4 of the old results is
  // not page 4 of the new ones). Only when the settled value has caught up
  // with the field: a field that was just cleared must not be written back
  // from the value it had a moment ago.
  const [text, setText] = useState(search.q ?? '');
  const settledText = useDebouncedValue(text, SEARCH_DEBOUNCE_MS);
  const written = search.q ?? '';
  useEffect(() => {
    const next = settledText.trim();
    if (settledText === text && next !== written) {
      onSearchChange(
        { ...search, q: next === '' ? undefined : next, page: 1 },
        { replace: true },
      );
    }
  }, [settledText, text, written, search, onSearchChange]);

  const rules = useQuery(
    redirectsQueryOptions(
      siteId,
      search.page,
      filtersFor(search.show, search.q),
    ),
  );
  const missing = useQuery(missingPathsQueryOptions(siteId, 1));

  const items = rules.data?.items ?? [];
  const total = rules.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / REDIRECTS_PAGE_SIZE));
  const isFiltered = search.show !== 'all' || search.q !== undefined;
  // Ids of rules that have since left the page linger harmlessly: only the
  // ones on screen count.
  const selected = items.filter((rule) => selectedIds.includes(rule.id));
  const canDelete = can('delete');

  function toggleSelected(id: string, next: boolean) {
    setSelectedIds((current) =>
      next
        ? current.includes(id)
          ? current
          : [...current, id]
        : current.filter((one) => one !== id),
    );
    setActionError('');
  }

  async function handleConfirmDelete() {
    setActionError('');
    setConfirmingDelete(false);
    // One after another, and only what went through is reported: a rule
    // that fails to go leaves the ones behind it ticked, and says why.
    const deleted: RedirectRecord[] = [];
    try {
      for (const rule of selected) {
        await deleteRedirect(rule.id);
        deleted.push(rule);
      }
    } catch (failure) {
      setActionError(actionErrorMessage(failure, t('redirects.delete.failed')));
    }
    if (deleted.length > 0) {
      await refresh();
      setSelectedIds((current) =>
        current.filter((id) => !deleted.some((rule) => rule.id === id)),
      );
      toast(t('redirects.delete.done', { count: deleted.length }), 'success');
    }
  }

  const namesShown = selected
    .slice(0, NAMES_SHOWN)
    .map((rule) => rule.from)
    .join(', ');
  const namesHidden = selected.length - NAMES_SHOWN;
  const names = namesHidden > 0 ? `${namesShown} + ${namesHidden}` : namesShown;

  function handleImported(report: RedirectImportReport) {
    toast(
      t('redirects.import.done', {
        created: report.created,
        updated: report.updated,
      }),
      'success',
    );
  }

  const tabs: { value: RedirectTab; label: string }[] = [
    { value: 'rules', label: t('redirects.tabs.rules') },
    {
      value: 'missing',
      label:
        missing.data && missing.data.total > 0
          ? t('redirects.tabs.missingCount', { count: missing.data.total })
          : t('redirects.tabs.missing'),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <SettingsSectionHeader
        title={t('settings.nav.items.redirects')}
        description={t('redirects.description')}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTesting(true)}
            >
              <Search />
              {t('redirects.actions.test')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setImporting(true)}
            >
              <Upload />
              {t('redirects.actions.import')}
            </Button>
            <Button
              type="button"
              onClick={() => setEditor({ kind: 'add', from: '' })}
            >
              {t('redirects.actions.add')}
            </Button>
          </>
        }
      />

      <Tabs
        id="redirects"
        label={t('redirects.tabs.label')}
        variant="underline"
        tabs={tabs}
        value={search.tab}
        // A tab is not a place to come back to: replaced, so Back leaves
        // the screen rather than walking through the tabs that were looked at.
        onChange={(tab) => go({ tab, page: 1 }, true)}
      />

      <TabPanel tabsId="redirects" value={search.tab}>
        {search.tab === 'rules' ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <Label htmlFor="redirects-search" className="sr-only">
                  {t('redirects.search.label')}
                </Label>
                <Input
                  id="redirects-search"
                  type="search"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={t('redirects.search.placeholder')}
                  autoComplete="off"
                />
              </div>
              <div className="sm:w-56">
                <OptionsSelect
                  aria-label={t('redirects.filter.label')}
                  value={search.show}
                  onValueChange={(next) => {
                    if (isFilter(next)) go({ show: next, page: 1 }, true);
                  }}
                  options={[
                    { value: 'all', label: t('redirects.filter.all') },
                    {
                      value: 'needs-target',
                      label: t('redirects.filter.needsTarget'),
                    },
                    { value: 'manual', label: t('redirects.filter.manual') },
                    { value: 'list', label: t('redirects.filter.list') },
                    {
                      value: 'wordpress',
                      label: t('redirects.filter.wordpress'),
                    },
                  ]}
                />
              </div>
            </div>

            {selected.length > 0 && canDelete && (
              <SelectionBar
                label={t('redirects.selection.label')}
                countText={t('redirects.selection.count', {
                  count: selected.length,
                })}
                onClear={() => setSelectedIds([])}
              >
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 />
                  {t('redirects.selection.delete')}
                </Button>
              </SelectionBar>
            )}
            <InlineError>{actionError}</InlineError>

            {rules.isPending && <SkeletonRows />}
            {rules.isError && (
              <InlineError>{t('redirects.loadFailed')}</InlineError>
            )}
            {rules.data && items.length === 0 && (
              <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
                {isFiltered ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {t('redirects.empty.filtered')}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setText('');
                        go({ q: undefined, show: 'all', page: 1 }, true);
                      }}
                    >
                      {t('redirects.empty.showAll')}
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      {t('redirects.empty.title')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t('redirects.empty.body')}
                    </p>
                  </>
                )}
              </div>
            )}
            {items.length > 0 && (
              <ul className="divide-y rounded-md border">
                {items.map((rule) => (
                  <RedirectRow
                    key={rule.id}
                    redirect={rule}
                    selectable={canDelete}
                    selected={selectedIds.includes(rule.id)}
                    onSelectedChange={(next) => toggleSelected(rule.id, next)}
                    onEdit={() => setEditor({ kind: 'edit', redirect: rule })}
                  />
                ))}
              </ul>
            )}
            <Pagination
              page={search.page}
              totalPages={totalPages}
              onPageChange={(page) => go({ page })}
            />
          </div>
        ) : (
          <MissingPathsPanel
            siteId={siteId}
            page={search.page}
            onPageChange={(page) => go({ page })}
            onRedirect={(path) => setEditor({ kind: 'add', from: path })}
          />
        )}
      </TabPanel>

      {editor && (
        <RedirectDialog
          // A new dialog for each rule, and for each address it is opened on.
          key={
            editor.kind === 'edit' ? editor.redirect.id : `add:${editor.from}`
          }
          siteId={siteId}
          defaultLocale={defaultLocale}
          enabledLocales={enabledLocales}
          redirect={editor.kind === 'edit' ? editor.redirect : null}
          initialFrom={editor.kind === 'add' ? editor.from : ''}
          onOpenChange={(open) => !open && setEditor(null)}
          onSubmit={async (body) => {
            if (editor.kind === 'edit') {
              await updateRedirect(editor.redirect.id, body);
              toast(t('redirects.dialog.saved'), 'success');
            } else {
              await createRedirect(body);
              toast(t('redirects.dialog.created'), 'success');
            }
          }}
        />
      )}
      {importing && (
        <ImportRedirectsDialog
          onOpenChange={(open) => !open && setImporting(false)}
          onCheck={(csv) => importList({ csv, dryRun: true })}
          onApply={(csv) => importList({ csv, dryRun: false })}
          onApplied={handleImported}
        />
      )}
      {testing && (
        <TestRedirectDialog
          siteId={siteId}
          onOpenChange={(open) => !open && setTesting(false)}
          onAddFor={(address) => {
            setTesting(false);
            setEditor({ kind: 'add', from: address });
          }}
        />
      )}
      {confirmingDelete && (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => !open && setConfirmingDelete(false)}
          title={t('redirects.delete.title', { count: selected.length })}
          description={t('redirects.delete.description', { names })}
          onConfirm={() => void handleConfirmDelete()}
        />
      )}
    </div>
  );
}
