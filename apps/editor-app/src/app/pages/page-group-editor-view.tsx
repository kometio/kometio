import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ExternalLink,
  GitFork,
  History,
  Languages,
  LayoutTemplate,
  Link2,
  Search,
  Tags,
} from 'lucide-react';
import { type PageGroupRecord } from '../../lib/page-groups-api-client';
import { CanvasEditorShell } from '../canvas/canvas-editor-shell';
import { collectionsQueryOptions } from '../collections/collections-queries';
import { LanguageSwitcher } from '../canvas/language-switcher';
import { ConfirmActionDialog } from '../common/confirm-action-dialog';
import { PromptDialog } from '../common/prompt-dialog';
import { useCurrentSession } from '../auth/use-current-session';
import { FormListProvider } from '../forms/form-list-provider';
import { IconListProvider } from '../style/icon-list-provider';
import { MediaPickerProvider } from '../media/media-picker-provider';
import { PageGroupSeoPanelDialog } from './page-group-seo-panel-dialog';
import { PageGroupTermsDialog } from './page-group-terms-dialog';
import { PageGroupTranslationsDialog } from './page-group-translations-dialog';
import { PageListProvider } from './page-list-provider';
import { useToast } from '../shell/toast-provider';
import { publicPagePath } from '../../lib/public-page-path';
import { PUBLIC_SITE_URL } from '../../lib/public-site-url';
import { usePageBlockRegistry } from './use-page-block-registry';
import { useSaveStatusText } from '../common/save-status-text';
import { usePageGroupEditor } from './use-page-group-editor';
import { VersionHistoryDialog } from '../common/version-history-dialog';
import { usePendingGenerationPrompt } from './pending-page-generation';
import { useLanguageFork } from './use-language-fork';
import { usePageHistorySources } from './use-page-history-sources';
import { useSavePageAsTemplate } from './use-save-page-as-template';

/**
 * Back to where this page is listed, which is not always Pages.
 *
 * A page filed in a collection belongs to that collection's screen: sending
 * somebody who opened an article from News back to Pages drops them
 * somewhere they were not, with their article nowhere in the list. It
 * reads the page's own collection rather than the history, so it is still
 * right on a reloaded tab or a shared link.
 */
function BackToList({ group }: { group: PageGroupRecord }) {
  const { t } = useTranslation();
  const { data: collections } = useQuery({
    ...collectionsQueryOptions(group.siteId),
    enabled: group.collectionId !== null,
  });
  const collection = (collections ?? []).find(
    (one) => one.id === group.collectionId,
  );

  if (!collection) {
    return (
      <Link to="/pages" className="hover:underline">
        ← {t('pages.editor.backToList')}
      </Link>
    );
  }
  return (
    <Link
      to="/collections/$collectionId"
      params={{ collectionId: collection.id }}
      className="hover:underline"
    >
      ← {collection.name}
    </Link>
  );
}

export interface PageGroupEditorViewProps {
  groupId: string;
  initialLocale: string;
  /**
   * The SITE's default locale — distinct from `initialLocale` (which
   * locale this view starts on): a group with no translation in the
   * site's default locale starts on whatever locale IS there instead (see
   * the route), but `translationRouting` below still needs the real site
   * default to decide when a translatable field writes to the shared
   * structure vs. this translation's own overlay.
   */
  defaultLocale: string;
  /** Every locale the site offers — the translations dialog needs this to know which ones are still missing from this group. */
  enabledLocales: string[];
}

/**
 * i18n a livello di campo (see the plan) — PageGroupEditorView is
 * page-editor-view.tsx's counterpart for the new PageGroup/PageTranslation
 * model: one PageGroup, a LanguageSwitcher to move between its
 * translations in place (no route change, see canvas-editor-shell.tsx's
 * own `languageSwitcher`/`translationRouting` props), plus SEO panel,
 * version history, and a translations-management dialog — same three
 * capabilities as the old PageEditorView, each rebuilt against the new
 * model instead of reused wholesale (see page-group-seo-panel-dialog.tsx/
 * use-page-group-versions.ts/page-group-translations-dialog.tsx's own
 * doc comments for what changed and what didn't carry over). Version
 * history has two sources: the shared structure and the active language's
 * own content, which is where an unlinked language keeps its tree
 * (docs/adr/0075). Page-picking (Link/NavLink/
 * Button/Banner/PromoBar/PricingPlan's `page` field) IS wired up, via
 * PageListProvider below.
 */
export function PageGroupEditorView({
  groupId,
  initialLocale,
  defaultLocale,
  enabledLocales,
}: PageGroupEditorViewProps) {
  const { t } = useTranslation();
  const { registry, categories } = usePageBlockRegistry();
  const {
    group,
    translations,
    activeLocale,
    setActiveLocale,
    activeTranslation,
    displayedBlocks,
    status,
    isSaving,
    onChange,
    whenSaved,
    hasFailedSave,
    onSaveFieldValue,
    handlePublish,
    handleDiverge,
    handleRelink,
  } = usePageGroupEditor(groupId, initialLocale);
  const statusText = useSaveStatusText(status, {
    publishedKey: 'pages.editor.published',
    // Once the page IS published, a landed save has moved the draft past
    // what a visitor sees. "Draft saved" would be true and beside the
    // point; the fact worth a line in the bar is that the two no longer
    // match. Until the first publish there is nothing online to be behind.
    savedKey:
      activeTranslation.status === 'published'
        ? 'pages.editor.unpublishedChangesAt'
        : undefined,
  });
  const [isSeoOpen, setIsSeoOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isTranslationsOpen, setIsTranslationsOpen] = useState(false);
  const [isNamingTemplate, setIsNamingTemplate] = useState(false);
  const [restoredAt, setRestoredAt] = useState(0);
  const generationPrompt = usePendingGenerationPrompt(groupId);
  const { toast } = useToast();
  const changesLiveSite = useCurrentSession().can('changeLiveSite');
  const onRestored = () => setRestoredAt((n) => n + 1);
  const {
    isDivergeConfirmOpen,
    setIsDivergeConfirmOpen,
    isRelinkConfirmOpen,
    setIsRelinkConfirmOpen,
    blocksLostOnRelink,
    confirmDiverge,
    confirmRelink,
  } = useLanguageFork({
    group,
    activeTranslation,
    activeLocale,
    registry,
    whenSaved,
    hasFailedSave,
    handleDiverge,
    handleRelink,
    onRelinked: onRestored,
  });
  const { saveAsTemplate, templateErrorMessage } = useSavePageAsTemplate({
    groupId,
    siteId: group.siteId,
    whenSaved,
    hasFailedSave,
  });
  const historySources = usePageHistorySources({
    groupId,
    activeTranslation,
    activeLocale,
    defaultLocale,
    isOpen: isHistoryOpen,
    whenSaved,
    onRestored,
  });
  const languageLabel = activeLocale.toUpperCase();

  /**
   * The canvas sends any change still waiting out its debounce before it
   * calls this; the translation is then published as the server holds it,
   * so publishing has to wait for that save to land. Before, a keystroke
   * made just before Publish could miss the published version.
   */
  async function publishWhenSaved() {
    await whenSaved();
    if (hasFailedSave()) {
      toast(t('canvas.status.publishUnsaved'), 'destructive');
      return;
    }
    await handlePublish();
  }

  return (
    // Same provider-nesting reasoning as page-editor-view.tsx, plus
    // PageListProvider (missing here until now — a real pre-existing gap:
    // picking a page for a Link/Button/Banner/PromoBar/PricingPlan/NavLink
    // block threw outside a PageListContext.Provider). Scoped to
    // `activeLocale`: the picker's own LISTING still filters by locale for
    // a sensible UX (docs/adr/0018), even though what gets stored is now
    // locale-independent (see page-list-provider.tsx's own comment).
    <MediaPickerProvider siteId={group.siteId}>
      <FormListProvider siteId={group.siteId}>
        <IconListProvider>
          <PageListProvider siteId={group.siteId} locale={activeLocale}>
            <CanvasEditorShell
              backLink={<BackToList group={group} />}
              languageSwitcher={
                <LanguageSwitcher
                  translations={translations}
                  value={activeLocale}
                  onChange={setActiveLocale}
                />
              }
              translationRouting={
                activeTranslation.isDiverged
                  ? undefined
                  : {
                      activeLocale,
                      defaultLocale,
                      onSaveFieldValue,
                    }
              }
              siteId={group.siteId}
              // The middle of the bar was empty — the page being edited was
              // named nowhere in the editor at all.
              title={
                activeTranslation.seoMeta.title || `/${activeTranslation.slug}`
              }
              publicationState={
                activeTranslation.status === 'published' ? 'published' : 'draft'
              }
              statusText={statusText}
              isSaving={isSaving}
              /*
               * Six unlabelled icons became a menu that says what each of
               * them does. They are the actions on the PAGE — its SEO, its
               * classification, its languages, its history — and sitting
               * next to undo and redo as icons there was nothing to
               * distinguish them from the actions on the CANVAS.
               */
              pageMenu={[
                // A page's SEO and terms show online without a publish, so
                // they are a publisher's (docs/roles.md).
                ...(changesLiveSite
                  ? [
                      {
                        label: t('pages.seo.open'),
                        icon: Search,
                        onSelect: () => setIsSeoOpen(true),
                      },
                      {
                        label: t('taxonomies.pageTitle'),
                        icon: Tags,
                        onSelect: () => setIsTermsOpen(true),
                      },
                    ]
                  : []),
                {
                  label: t('pages.translations.open'),
                  icon: Languages,
                  onSelect: () => setIsTranslationsOpen(true),
                },
                {
                  label: t('pages.versionHistory.open'),
                  icon: History,
                  onSelect: () => setIsHistoryOpen(true),
                },
                {
                  label: t('pages.saveAsTemplate.open'),
                  icon: LayoutTemplate,
                  onSelect: () => setIsNamingTemplate(true),
                },
                activeTranslation.isDiverged
                  ? {
                      label: t('canvas.language.relinkAction'),
                      icon: Link2,
                      onSelect: () => setIsRelinkConfirmOpen(true),
                    }
                  : {
                      label: t('canvas.language.divergeAction'),
                      icon: GitFork,
                      onSelect: () => setIsDivergeConfirmOpen(true),
                    },
                // Same "only once there's something live to see" gate as
                // before, and still a real link so it can be middle-clicked
                // or copied.
                ...(activeTranslation.status === 'published'
                  ? [
                      {
                        label: t('pages.editor.viewPage'),
                        icon: ExternalLink,
                        href: `${PUBLIC_SITE_URL}${publicPagePath(activeTranslation.locale, activeTranslation.slug)}`,
                      },
                    ]
                  : []),
              ]}
              registry={registry}
              categories={categories}
              blocks={displayedBlocks}
              onChange={onChange}
              whenSaved={whenSaved}
              onPublish={publishWhenSaved}
              pageId={activeTranslation.id}
              restoredAt={restoredAt}
              pageGeneration={{
                siteId: group.siteId,
                locale: activeLocale,
                // A linked language edits the original's blocks: a page
                // generated into it would replace the original's too.
                blockedBy:
                  activeLocale !== defaultLocale &&
                  !activeTranslation.isDiverged
                    ? 'linked-translation'
                    : undefined,
                initialPrompt: generationPrompt,
              }}
            >
              <VersionHistoryDialog
                // Remounted per language, so a tab chosen on one does not
                // carry over to another where it means something else.
                key={activeTranslation.id}
                sources={historySources}
                open={isHistoryOpen}
                onOpenChange={setIsHistoryOpen}
              />
              <PageGroupSeoPanelDialog
                groupId={groupId}
                translationId={activeTranslation.id}
                seoMeta={activeTranslation.seoMeta}
                open={isSeoOpen}
                onOpenChange={setIsSeoOpen}
              />
              <PageGroupTermsDialog
                groupId={groupId}
                siteId={group.siteId}
                open={isTermsOpen}
                onOpenChange={setIsTermsOpen}
              />
              <PageGroupTranslationsDialog
                groupId={groupId}
                parentGroupId={group.parentId}
                translations={translations}
                enabledLocales={enabledLocales}
                activeLocale={activeLocale}
                onSelectLocale={setActiveLocale}
                open={isTranslationsOpen}
                onOpenChange={setIsTranslationsOpen}
              />
              <ConfirmActionDialog
                open={isDivergeConfirmOpen}
                onOpenChange={setIsDivergeConfirmOpen}
                title={t('canvas.language.divergeConfirmTitle', {
                  locale: activeLocale.toUpperCase(),
                })}
                description={t('canvas.language.divergeConfirmBody')}
                onConfirm={() => void confirmDiverge()}
                actionLabel={t('canvas.language.divergeConfirmAction')}
                actionVariant="default"
              />
              <ConfirmActionDialog
                open={isRelinkConfirmOpen}
                onOpenChange={setIsRelinkConfirmOpen}
                title={t('canvas.language.relinkConfirmTitle', {
                  locale: languageLabel,
                })}
                description={[
                  t('canvas.language.relinkConfirmBody'),
                  blocksLostOnRelink > 0
                    ? t('canvas.language.relinkConfirmLost', {
                        count: blocksLostOnRelink,
                      })
                    : null,
                  t('canvas.language.relinkConfirmHistory'),
                ]
                  .filter(Boolean)
                  .join(' ')}
                onConfirm={() => void confirmRelink()}
                actionLabel={t('canvas.language.relinkConfirmAction')}
                actionVariant={
                  blocksLostOnRelink > 0 ? 'destructive' : 'default'
                }
              />
              <PromptDialog
                open={isNamingTemplate}
                onOpenChange={setIsNamingTemplate}
                title={t('pages.saveAsTemplate.open')}
                label={t('pages.saveAsTemplate.nameLabel')}
                initialValue={
                  (
                    translations.find(
                      (translation) => translation.locale === defaultLocale,
                    ) ?? activeTranslation
                  ).seoMeta.title
                }
                submitLabel={t('pages.saveAsTemplate.submit')}
                busyLabel={t('common.saving')}
                onSubmit={saveAsTemplate}
                errorMessage={templateErrorMessage}
              />
            </CanvasEditorShell>
          </PageListProvider>
        </IconListProvider>
      </FormListProvider>
    </MediaPickerProvider>
  );
}
