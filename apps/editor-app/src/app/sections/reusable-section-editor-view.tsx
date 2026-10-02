import { useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { History, Pencil } from 'lucide-react';
import { pageBlockCategories, pageBlocks } from '@kometio/block-registry';
import { useTranslation } from '../../lib/use-translation';
import { useSaveStatusText } from '../common/save-status-text';
import { CanvasEditorShell } from '../canvas/canvas-editor-shell';
import { IconListProvider } from '../style/icon-list-provider';
import { MediaPickerProvider } from '../media/media-picker-provider';
import { PageListProvider } from '../pages/page-list-provider';
import { useReusableSectionEditor } from './use-reusable-section-editor';
import { useReusableSectionVersions } from './use-reusable-section-versions';
import { useCurrentSession } from '../auth/use-current-session';
import { Button } from '../../components/ui/button';
import { PromptDialog } from '../common/prompt-dialog';
import { VersionHistoryDialog } from '../common/version-history-dialog';
import { ApiError, actionErrorMessage } from '../../lib/http-client';
import { useToast } from '../shell/toast-provider';

export interface ReusableSectionEditorViewProps {
  sectionId: string;
  siteId: string;
  /** A section has no locale of its own — this is the one its links resolve in. */
  locale: string;
}

/**
 * A section is edited on its own screen, never in place on a page
 * (docs/adr/0059). Elementor and Webflow both do it this way, and for the
 * reason that decided it here: editing in place on a page used by eight
 * others is how an accidental change to all eight happens.
 *
 * The full page-block registry, not a reduced one: a section is a strip of
 * an ordinary page, so anything that can go on a page can go in one.
 */
export function ReusableSectionEditorView({
  sectionId,
  siteId,
  locale,
}: ReusableSectionEditorViewProps) {
  const { t } = useTranslation();
  const {
    section,
    status,
    isSaving,
    handleChange,
    handlePublish,
    toggleExposedField,
    whenSaved,
    rename,
  } = useReusableSectionEditor(sectionId);
  const { toast } = useToast();
  const changesLiveSite = useCurrentSession().can('changeLiveSite');
  const statusText = useSaveStatusText(status, {
    publishedKey: 'sections.published',
  });
  const [isRenaming, setIsRenaming] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [restoredAt, setRestoredAt] = useState(0);
  const flushCanvasRef = useRef<(() => void) | null>(null);
  const {
    versions,
    isLoading: isLoadingVersions,
    rollback,
  } = useReusableSectionVersions(section.id, isHistoryOpen);

  async function handleRollback(versionId: string) {
    // A save still on its way would land after the restore and overwrite
    // it with the section as it was before — and so would a change still in
    // the canvas's debounce, which is not on its way yet. The header
    // editor's own order.
    flushCanvasRef.current?.();
    await whenSaved();
    await rollback(versionId);
    setRestoredAt((n) => n + 1);
  }

  // One object per section, not per render: the canvas mints its preview
  // token, and loads the page, when this changes — built inline, it
  // changed on every save.
  const sectionPreview = useMemo(
    () => ({ sectionId: section.id, locale }),
    [section.id, locale],
  );

  return (
    <MediaPickerProvider siteId={siteId}>
      <PageListProvider siteId={siteId} locale={locale}>
        <IconListProvider>
          <CanvasEditorShell
            whenSaved={whenSaved}
            backLink={
              <Link
                to="/sections"
                // Back to the list it came from: the templates, if it is one.
                search={{ kind: section.kind }}
                className="whitespace-nowrap hover:underline"
              >
                {t('sections.backToList')}
              </Link>
            }
            siteId={siteId}
            // What is being edited, named: the bar said only the way back.
            title={section.name}
            publicationState={section.status}
            statusText={statusText}
            isSaving={isSaving}
            actions={
              <>
                {/* Written, and only the icon on a phone where the bar has
                    no room for the words: they stay for a screen reader. */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="max-sm:px-2"
                  onClick={() => setIsRenaming(true)}
                >
                  <Pencil />
                  <span className="max-sm:sr-only">{t('sections.rename')}</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="max-sm:px-2"
                  onClick={() => setIsHistoryOpen(true)}
                >
                  <History />
                  <span className="max-sm:sr-only">
                    {t('pages.versionHistory.open')}
                  </span>
                </Button>
              </>
            }
            restoredAt={restoredAt}
            flushRef={flushCanvasRef}
            registry={pageBlocks}
            categories={pageBlockCategories}
            blocks={section.content}
            onChange={handleChange}
            onPublish={handlePublish}
            // No page is involved: the canvas renders the section's own
            // preview route instead (see CanvasFrame.sectionPreview). The
            // section's id stands in for `pageId`, which nothing reads
            // while `sectionPreview` is set.
            pageId={section.id}
            sectionPreview={sectionPreview}
            // What a page may change shows online on every instance at
            // once, so it is a publisher's (docs/roles.md).
            sectionEditing={
              changesLiveSite
                ? {
                    exposedFields: section.exposedFields,
                    onToggleField: toggleExposedField,
                  }
                : undefined
            }
          >
            <PromptDialog
              open={isRenaming}
              onOpenChange={setIsRenaming}
              title={t('sections.renameDialog.title')}
              label={t('sections.nameLabel')}
              initialValue={section.name}
              submitLabel={t('sections.renameDialog.submit')}
              busyLabel={t('sections.renameDialog.busy')}
              onSubmit={async (name) => {
                if (name !== section.name) {
                  await rename(name);
                  toast(t('sections.renamed', { name }), 'success');
                }
              }}
              errorMessage={(error) =>
                error instanceof ApiError && error.status === 409
                  ? t('sections.nameTaken')
                  : actionErrorMessage(error, t('sections.renameFailed'))
              }
            />
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
        </IconListProvider>
      </PageListProvider>
    </MediaPickerProvider>
  );
}
