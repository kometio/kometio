import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from '@tanstack/react-router';
import { History } from 'lucide-react';
import { headerFooterBlocks } from '@kometio/block-registry';
import { useSaveStatusText } from '../common/save-status-text';
import { CanvasEditorShell } from '../canvas/canvas-editor-shell';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { LanguageSwitcher } from '../canvas/language-switcher';
import { IconListProvider } from '../style/icon-list-provider';
import { MediaPickerProvider } from '../media/media-picker-provider';
import { PageListProvider } from '../pages/page-list-provider';
import type { SiteLayoutSectionKind } from '../../lib/site-layout-sections-api-client';
import { Switch } from '../../components/ui/switch';
import { useRepresentativePage } from '../pages/use-representative-page';
import { useSiteLayoutSectionEditor } from './use-site-layout-section-editor';
import { useSiteLayoutSectionVersions } from './use-site-layout-section-versions';
import { VersionHistoryDialog } from '../common/version-history-dialog';
import { useCurrentSession } from '../auth/use-current-session';

// The header and footer share a single registry (docs/adr/0018, see the
// comment on headerFooterBlocks itself) — no separate categorization exists
// for them yet, and a single "Blocks" section is enough while the registry
// stays small (12 types).
const headerFooterCategories = [
  {
    title: 'blocks.categories.headerFooter',
    types: headerFooterBlocks.map((block) => block.type),
  },
];

export interface SiteLayoutSectionEditorViewProps {
  siteId: string;
  locale: string;
  /** The site's languages: each has its own header and its own footer. */
  enabledLocales: string[];
  kind: SiteLayoutSectionKind;
}

/**
 * A single generic view for both Header and Footer (docs/adr/0018), not
 * two near-identical components — they share the exact same lifecycle,
 * only the `kind` (and therefore the query/mutations it drives) differs.
 */
export function SiteLayoutSectionEditorView({
  siteId,
  locale,
  enabledLocales,
  kind,
}: SiteLayoutSectionEditorViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    section,
    status,
    isSaving,
    handleChange,
    handlePublish,
    handleStickyChange,
    whenSaved,
  } = useSiteLayoutSectionEditor(siteId, locale, kind);
  const changesLiveSite = useCurrentSession().can('changeLiveSite');
  const statusText = useSaveStatusText(status, {
    publishedKey: 'layout.editor.published',
  });
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [restoredAt, setRestoredAt] = useState(0);
  const {
    versions,
    isLoading: isLoadingVersions,
    rollback,
  } = useSiteLayoutSectionVersions(
    section.id,
    siteId,
    locale,
    kind,
    isHistoryOpen,
  );
  // canvas-editor-shell.tsx always renders the real Astro canvas of ONE
  // PAGE (see canvas-frame.tsx) — the header and footer have none of their
  // own, so a representative one in the same language is needed as the
  // backdrop to show the header/footer being edited against.
  const { page: representativePage, isLoading: isLoadingRepresentativePage } =
    useRepresentativePage(siteId, locale);

  const flushCanvasRef = useRef<(() => void) | null>(null);

  async function handleRollback(versionId: string) {
    // A save still on its way would land after the restore and overwrite
    // it with the header as it was before — the page editor's own wait.
    // A change still in the canvas's debounce is not on its way yet, so
    // it is sent first, or it would land after the restore and undo it.
    flushCanvasRef.current?.();
    await whenSaved();
    await rollback(versionId);
    setRestoredAt((n) => n + 1);
  }

  const sectionLabel =
    kind === 'header' ? t('layout.editHeader') : t('layout.editFooter');
  const sectionName =
    kind === 'header' ? t('layout.headerTitle') : t('layout.footerTitle');

  return (
    <MediaPickerProvider siteId={siteId}>
      <PageListProvider siteId={siteId} locale={locale}>
        <IconListProvider>
          {!isLoadingRepresentativePage && !representativePage ? (
            <div className="flex h-screen items-center justify-center p-6 text-center text-sm text-muted-foreground">
              {t('layout.editor.noPageToPreview', { section: sectionLabel })}
            </div>
          ) : (
            representativePage && (
              <CanvasEditorShell
                whenSaved={whenSaved}
                backLink={
                  <Link
                    to="/layout"
                    search={{ locale }}
                    className="whitespace-nowrap hover:underline"
                  >
                    ← {t('layout.editor.backToList')}
                  </Link>
                }
                siteId={siteId}
                // What is being edited, in the language it is edited in:
                // the bar named nothing but "Header e footer" to go back to.
                title={`${sectionName} · ${locale.toUpperCase()}`}
                // Whether visitors see it at all — a header never published
                // is not on the site yet, and nothing said so.
                publicationState={section.status}
                // Each language has its own header, and they were only
                // reachable from the list this editor leaves.
                languageSwitcher={
                  enabledLocales.length > 1 ? (
                    <LanguageSwitcher
                      translations={enabledLocales.map((code) => ({
                        locale: code,
                        isDiverged: false,
                      }))}
                      value={locale}
                      onChange={(next) =>
                        void navigate({
                          to:
                            kind === 'header'
                              ? '/layout/header'
                              : '/layout/footer',
                          search: { locale: next },
                        })
                      }
                    />
                  ) : undefined
                }
                statusText={statusText}
                isSaving={isSaving}
                actions={
                  /* Written, not an icon with a tooltip: the canvas has no
                     action you have to hover over to learn. */
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsHistoryOpen(true)}
                    className="max-sm:px-2"
                  >
                    <History />
                    {/* Only the icon on a phone: with its words the name of
                        what is being edited was squeezed to one letter. The
                        words stay for a screen reader. */}
                    <span className="max-sm:sr-only">
                      {t('pages.versionHistory.open')}
                    </span>
                  </Button>
                }
                noSelectionExtra={
                  kind === 'header' ? (
                    <>
                      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {t('layout.editor.headerSettings')}
                      </h3>
                      {/* "Stick while scrolling" sat on its own in the bar
                          above the canvas. It is the header's one setting,
                          so it is with the header's properties, named. */}
                      <div className="flex items-center gap-2">
                        <Switch
                          id="header-sticky"
                          size="sm"
                          checked={section.sticky}
                          onCheckedChange={handleStickyChange}
                          // Live at once, without a publish: a
                          // publisher's (docs/roles.md).
                          disabled={!changesLiveSite}
                        />
                        <Label htmlFor="header-sticky" className="font-normal">
                          {t('layout.editor.sticky')}
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('layout.editor.stickyHint')}
                      </p>
                    </>
                  ) : undefined
                }
                registry={headerFooterBlocks}
                categories={headerFooterCategories}
                blocks={section.content}
                onChange={handleChange}
                onPublish={handlePublish}
                pageId={representativePage.id}
                editingSection={kind}
                restoredAt={restoredAt}
                flushRef={flushCanvasRef}
              >
                <VersionHistoryDialog
                  sources={[
                    {
                      key: 'section',
                      label: t('pages.versionHistory.title'),
                      versions,
                      isLoading: isLoadingVersions,
                      onRollback: handleRollback,
                    },
                  ]}
                  open={isHistoryOpen}
                  onOpenChange={setIsHistoryOpen}
                />
              </CanvasEditorShell>
            )
          )}
        </IconListProvider>
      </PageListProvider>
    </MediaPickerProvider>
  );
}
