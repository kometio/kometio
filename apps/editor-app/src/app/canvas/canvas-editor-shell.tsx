import {
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { type Block, type ExposedFields } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import { Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { PUBLIC_SITE_URL } from '../../lib/public-site-url';
import { useTranslation } from '../../lib/use-translation';
import { useToast } from '../shell/toast-provider';
import { usePageList } from '../pages/page-list-context';
import { useIconList } from '../style/icon-list-context';
import { findMissingThemeIcons } from '../style/missing-theme-icons';
import { useUnsavedChangesGuard } from '../common/use-unsaved-changes-guard';
import { ConfirmActionDialog } from '../common/confirm-action-dialog';
import { useApplySavedInterfaceLanguage } from '../account/use-interface-language';
import { useCurrentSession } from '../auth/use-current-session';
import { BlockPicker, type BlockPickerCategory } from './block-picker';
import { TemplatePicker } from './template-picker';
import { BlockToolbarOverlay } from './block-toolbar-overlay';
import type { Breakpoint } from './breakpoint-selector';
import {
  buildPreviewUrl,
  CanvasFrame,
  type EditingSection,
} from './canvas-frame';
import { describeSelection } from './canvas-selection';
import { CanvasTopBar, type CanvasPageMenuItem } from './canvas-top-bar';
import { CanvasRail, LEFT_PANEL_ID } from './canvas-rail';
import {
  buildCommandItems,
  canvasCommandGroups,
  runCommand,
} from './canvas-commands';
import { CollapsibleSidePanel } from './collapsible-side-panel';
import { CanvasLayersTab } from './canvas-layers-tab';
import { BlockBreadcrumb } from './block-breadcrumb';
import { CommandMenu } from '../common/command-menu';
import { EmptyPagePrompt } from './empty-page-prompt';
import { KeyboardShortcutsDialog } from './keyboard-shortcuts-dialog';
import { MobilePanelBar, MobileSheetPanel } from './mobile-panel-sheet';
import { NoSelectionPanel } from './no-selection-panel';
import { SectionFocusOverlay } from './section-focus-overlay';
import { PropertiesPanel } from './properties-panel';
import { buildSectionEditing } from './section-editing';
import { useCanvasPanels } from './use-canvas-panels';
import { siblingDropRects } from './compute-drop-target';
import { isRectVisibleInIframe, useIframeGeometry } from './overlay-layer';
import { canPlace } from './use-block-tree';
import { useBlockStyleSheet } from './use-block-style-sheet';
import { useBlockTreeMutations } from './use-block-tree-mutations';
import { useCanvasDraft } from './use-canvas-draft';
import { useCanvasDragReorder } from './use-canvas-drag-reorder';
import { useCanvasPreviewToken } from './use-canvas-preview-token';
import { useCanvasShortcuts } from './use-canvas-shortcuts';
import { useMakeReusableSection } from './use-make-reusable-section';
import {
  usePageGenerationEntry,
  type PageGenerationConfig,
} from './use-page-generation-entry';
import { usePublishFlow } from './use-publish-flow';
import { useSelectedBlockEditing } from './use-selected-block-editing';
import { usePreviewBridge } from './use-preview-bridge';
import { useSidebarDrag } from './use-sidebar-drag';
import { useTextEdit } from './use-text-edit';

export interface CanvasEditorShellProps {
  backLink: ReactNode;
  /** Dropdown for switching to another page without leaving the editor (top bar, next to `backLink`) — only the page editor passes it; the Header/Footer editor does not (it has no notion of "other pages to choose between"). */
  pageSwitcher?: ReactNode;
  /** Field-level i18n (see the plan) — dropdown for switching to another language of the SAME PageGroup without leaving the editor, next to `pageSwitcher`. Only PageGroupEditorView passes it. */
  languageSwitcher?: ReactNode;
  /**
   * Field-level i18n — present only while editing a LINKED (not diverged)
   * PageTranslation of a PageGroup: it decides whether a changed
   * `translatable` field is written to the active translation's
   * `fieldValues` overlay instead of to the shared structure. Absent for
   * the old Page editor, for the Header/Footer editor, and for an already
   * unlinked translation (which behaves like the old model: always
   * `onChange`, never a separate overlay).
   */
  translationRouting?: {
    activeLocale: string;
    defaultLocale: string;
    onSaveFieldValue: (blockId: string, field: string, value: string) => void;
  };
  /** When present, and the person may configure the site, the rail offers the Style page — both editors (page, header/footer) have a site to apply styles to. */
  siteId?: string;
  /** What is being edited, in words — the middle of the top bar used to be empty. */
  title?: string;
  /** Page editor only: whether visitors can see the page at all, shown as a badge beside its name. */
  publicationState?: 'draft' | 'published';
  /** Page-level actions, drawn as a labelled menu rather than a row of unlabelled icons. */
  pageMenu?: CanvasPageMenuItem[];
  statusText: string;
  /**
   * Whether a write this editor's own hook owns is on the wire. It joins
   * the canvas's debounce window to decide when leaving the BROWSER is
   * worth interrupting somebody over (see useUnsavedChangesGuard) — the
   * shell can see the debounce, only the caller can see the request.
   */
  isSaving?: boolean;
  actions?: ReactNode;
  /** Shown in the Properties panel while no block is selected — the header's own settings, next to the blocks'. See NoSelectionPanel. */
  noSelectionExtra?: ReactNode;
  registry: BlockDescriptor[];
  categories: BlockPickerCategory[];
  blocks: Block[];
  /** Called with the updated tree on every change (property, text, insert, reorder, removal) — the caller owns the real draft save. */
  onChange: (blocks: Block[]) => void;
  /**
   * Resolves when every draft save the caller has queued has landed.
   *
   * The canvas asks before it reads the draft back — reloading the iframe,
   * or rendering a block whose content lives on the server (a reusable
   * section). Without it the iframe could fetch the draft from before the
   * change that caused the reload.
   */
  whenSaved?: () => Promise<void>;
  onPublish: (blocks: Block[]) => unknown;
  /**
   * Always the id of ONE PageTranslation (field-level i18n), even while
   * editing the header/footer (see canvas-frame.tsx) — the caller picks
   * which translation to use as context when `editingSection` is present
   * (site-layout-section-editor-view.tsx uses the "representative"
   * translation from use-representative-page.ts).
   */
  pageId: string;
  editingSection?: EditingSection;
  /** Present only in the reusable-section editor — see CanvasFrame's own prop. */
  sectionPreview?: { sectionId: string; locale: string };
  /**
   * Also section-editor only (docs/adr/0059): it puts an "a page may
   * change this" checkbox beside every field, which is how the agency
   * decides what a client may touch on an instance.
   */
  sectionEditing?: {
    exposedFields: ExposedFields;
    onToggleField: (blockId: string, field: string) => void;
  };
  /** Bumped only on an explicit rollback — the same mechanism block-editor-shell.tsx (Puck) used to reset local state. */
  restoredAt?: number;
  /**
   * Filled with the shell's own flush: it sends at once any change still
   * waiting out the debounce. For the actions a view draws outside the
   * shell (its history dialog) that must not be overtaken by one — a
   * restore waits for the saves already queued, and a change still in
   * the debounce is not queued yet: it would land after the restore and
   * undo it. The page menu's items are flushed by the shell itself.
   */
  flushRef?: MutableRefObject<(() => void) | null>;
  /** Page editor only: "Generate with AI", written by the site's own provider. */
  pageGeneration?: PageGenerationConfig;
  children?: ReactNode;
}

/**
 * The shell shared by the page editor and the Header/Footer editor: the
 * real Astro canvas in an iframe (docs/adr/0028), with Layers, Inspector
 * and BlockPicker around it and inline text editing mounted in place via
 * TipTap. It replaced `block-editor-shell.tsx`, the last of Puck
 * (docs/adr/0033).
 */
export function CanvasEditorShell({
  backLink,
  pageSwitcher,
  languageSwitcher,
  translationRouting,
  siteId,
  title,
  publicationState,
  pageMenu,
  statusText,
  isSaving = false,
  actions,
  noSelectionExtra,
  registry,
  categories,
  blocks,
  onChange,
  whenSaved,
  onPublish,
  pageId,
  editingSection,
  sectionPreview,
  sectionEditing,
  restoredAt = 0,
  flushRef,
  pageGeneration,
  children,
}: CanvasEditorShellProps) {
  const { t, tLabel } = useTranslation();
  // The canvas is not inside the shell, so the language the person saved is
  // applied here too: a reload on a page of the editor opens it in English.
  useApplySavedInterfaceLanguage();
  const { toast } = useToast();
  const { pick: pickPage } = usePageList();
  const { isMissingFromTheme } = useIconList();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridge = usePreviewBridge(iframeRef, PUBLIC_SITE_URL);
  const iframeGeometry = useIframeGeometry(iframeRef);
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('base');
  const {
    leftPanel,
    inspectorPanel,
    isNarrow,
    mobileSheet,
    setMobileSheet,
    propertiesPanelRef,
    focusProperties,
    openInsert,
  } = useCanvasPanels();
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // Bumped where the canvas cannot be patched in place — replacing a block
  // with a reusable section, whose blocks the client does not hold
  // (docs/adr/0059). It is the `key` of CanvasFrame, so a bump remounts the
  // iframe with a fresh preview token.
  const [canvasNonce, setCanvasNonce] = useState(0);
  // After the save it is reloading BECAUSE of: the fresh iframe reads the
  // draft from the server, so remounting while that save was still in
  // flight showed the page as it was one change ago.
  const reloadCanvas = useCallback(() => {
    void (async () => {
      await whenSaved?.();
      setCanvasNonce((n) => n + 1);
    })();
  }, [whenSaved]);

  const token = useCanvasPreviewToken(pageId, sectionPreview);
  const {
    localBlocks,
    setLocalBlocks,
    localBlocksRef,
    recordEditRef,
    scheduleChange,
    scheduleTextChange,
    scheduleStyleOverrideChange,
    scheduleVariantChange,
    flushAll,
    hasPendingWrites,
  } = useCanvasDraft({
    blocks,
    pageId,
    restoredAt,
    token,
    sectionPreview,
    registry,
    translationRouting,
    onChange,
    whenSaved,
    bridge,
  });

  const {
    placeholders,
    isPlaceholderConfirmOpen,
    setIsPlaceholderConfirmOpen,
    handlePublish,
    requestPublish,
  } = usePublishFlow({ localBlocks, localBlocksRef, flushAll, onPublish });

  // Closing the tab inside the debounce used to lose the last change in
  // silence. Both halves of "not written yet" count: the timer this shell
  // owns, and the request the caller owns.
  useUnsavedChangesGuard({
    hasUnsavedChanges: hasPendingWrites || isSaving,
    onBeforeUnload: flushAll,
  });

  useEffect(() => {
    if (!flushRef) return;
    flushRef.current = flushAll;
    return () => {
      flushRef.current = null;
    };
  }, [flushRef, flushAll]);

  useTextEdit({
    bridge,
    registry,
    localBlocksRef,
    setLocalBlocks,
    scheduleTextChange,
    pickPage,
    // Translated HERE and sent into the iframe: the preview document is a
    // rendered site in the VISITOR's language, and its editing chrome has
    // to speak the editor's instead. See RichTextMenuLabels.
    menuLabels: {
      bold: t('canvas.richText.bold'),
      italic: t('canvas.richText.italic'),
      underline: t('canvas.richText.underline'),
      strike: t('canvas.richText.strike'),
      bulletList: t('canvas.richText.bulletList'),
      orderedList: t('canvas.richText.orderedList'),
      linkToPage: t('canvas.richText.linkToPage'),
      linkToUrl: t('canvas.richText.linkToUrl'),
      unlink: t('canvas.richText.unlink'),
      urlPrompt: t('canvas.richText.urlPrompt'),
    },
  });

  // A drag out of the SIDEBAR has no block in the tree yet, so it always
  // measures against the root — the level it drops at.
  const rootRects = siblingDropRects(
    localBlocks,
    bridge.blockRects,
    null,
  ).rects;

  const {
    selectedBlock,
    selectedDescriptor,
    selectedBlocks,
    selectedAncestry,
    selectedRect,
    isSelectedRootLevel,
    canMoveSelectedUp,
    canMoveSelectedDown,
  } = describeSelection(localBlocks, bridge, registry, tLabel);
  // Every block of the tree, not just the selected one: the layers panel
  // marks each block whose icon the theme does not have (ADR-0090).
  const missingIcons = findMissingThemeIcons(
    localBlocks,
    registry,
    isMissingFromTheme,
  );
  /**
   * A block that belongs inside one kind of container (a Column, a Tab) can
   * be aimed somewhere that will not have it — pasted with only the page
   * around it, say. Saying so beats a click that does nothing.
   */
  function notifyPlacementRefused(blockTypes: string[]): void {
    const refused = blockTypes
      .map((type) => registry.find((d) => d.type === type))
      .find((descriptor) => descriptor?.allowedParentTypes?.length);
    if (!refused?.allowedParentTypes) {
      return;
    }
    toast(
      t('canvas.placement.refused', {
        block: tLabel(refused.label),
        parents: refused.allowedParentTypes
          .map((type) =>
            tLabel(registry.find((d) => d.type === type)?.label ?? type),
          )
          .join(', '),
      }),
      'destructive',
    );
  }

  // Before the mutations, which send it too: a copy of a styled block is
  // a new id, and its rule has to reach the iframe with it.
  const styleSheet = useBlockStyleSheet(bridge, localBlocksRef);

  const {
    canInsertType,
    handleInsert,
    handleInsertBlocks,
    handleReorder,
    handleRemoveSelected,
    handleMoveSelected,
    handleAlignSelected,
    handleDuplicateSelected,
    handlePasteMany,
    handleReparent,
    handleRemoveMany,
    handleDuplicateMany,
    handleReplaceSelected,
    handleAppendBlocks,
    handleReplaceAll,
    handleAddChild,
    handleInsertAtRoot,
    insertNewBlockAt,
    undo,
    redo,
    canUndo,
    canRedo,
    recordEdit,
  } = useBlockTreeMutations({
    localBlocks,
    setLocalBlocks,
    onChange,
    registry,
    bridge,
    token,
    pageId,
    fragmentSection: sectionPreview,
    reloadCanvas,
    whenSaved,
    refreshStyleSheet: styleSheet.refresh,
    onPlacementRefused: notifyPlacementRefused,
    selectedBlock,
    selectedDescriptor,
    canvasReady: bridge.isReady,
  });
  // What goes live, and the site-wide type styles, are not every role's
  // (docs/roles.md): the bar offers only what this person may do.
  const { can } = useCurrentSession();
  const changesLiveSite = can('changeLiveSite');
  const configuresSite = can('configureSite');
  const generation = usePageGenerationEntry({
    // Never inside the header/footer or a section: generating is for a page.
    config: editingSection || sectionPreview ? undefined : pageGeneration,
    blocks: localBlocks,
    registry,
    isMissingFromTheme,
    canvasReady: bridge.isReady,
    onAppend: handleAppendBlocks,
    onReplace: handleReplaceAll,
  });
  const makeReusable = useMakeReusableSection({
    siteId,
    selectedBlock,
    localBlocks,
    registry,
    handleReplaceSelected,
  });

  // Closes the loop opened by useCanvasDraft's `recordEditRef`. In an
  // effect rather than during render (React forbids touching a ref there,
  // and the linter says so): the burst callbacks only ever run from a
  // debounce timer, which needs a user action first, so they can never fire
  // before this has run.
  useEffect(() => {
    recordEditRef.current = recordEdit;
  });

  const {
    sidebarDrag,
    handleSidebarDragStart,
    handleSidebarDragMove,
    handleSidebarDragEnd,
  } = useSidebarDrag({
    localBlocks,
    registry,
    iframeGeometry,
    rootRects,
    blockRects: bridge.blockRects,
    insertNewBlockAt,
    onPlacementRefused: notifyPlacementRefused,
  });

  useCanvasShortcuts({
    undo,
    redo,
    handleMoveSelected,
    handlePasteMany,
    handleRemoveMany,
    handleDuplicateMany,
    selectedBlocks,
    openCommandMenu: () => setIsCommandMenuOpen(true),
    openInsert,
    openShortcuts: () => setIsShortcutsOpen(true),
  });

  const liveDropTarget = useCanvasDragReorder({
    localBlocks,
    bridge,
    sidebarDrag,
    rootRects,
    iframeGeometry,
    handleReorder,
    handleReparent,
    // The same two answers the Layers panel asks for, so one gesture
    // cannot be allowed in one place and refused in the other.
    containerRules: {
      isContainerType: (type) =>
        Boolean(registry.find((d) => d.type === type)?.isContainer),
      canContain: (parentType, childType) =>
        canPlace(registry, parentType, childType),
    },
  });

  const {
    handleChangeProp,
    handleChangeVariant,
    handleChangeStyleOverride,
    typeStyle,
  } = useSelectedBlockEditing({
    siteId,
    selectedBlock,
    selectedDescriptor,
    registry,
    breakpoint,
    bridge,
    styleSheet,
    localBlocksRef,
    setLocalBlocks,
    onChange,
    patch: {
      scheduleChange,
      scheduleVariantChange,
      scheduleStyleOverrideChange,
    },
  });

  /*
   * A change still waiting out the debounce is sent the moment any page
   * action is chosen, rather than up to 300ms later. Sending is all this
   * does: an action that needs the server to HOLD the edit before it runs
   * waits for the save itself — "Save as template" does, with `whenSaved`,
   * because it copies the page on the server. The others (history, SEO,
   * languages, fork) only start the save sooner; they do not wait for it.
   */
  const flushedPageMenu = pageMenu?.map(({ onSelect, ...item }) => ({
    ...item,
    ...(onSelect
      ? {
          onSelect: () => {
            flushAll();
            onSelect();
          },
        }
      : {}),
  }));

  /** The same `token` already in state for `usePropertyPatch` — opens the preview URL in a new tab, available even for a draft that was never published (unlike a direct link to the public site). */
  function handleOpenPreview(): void {
    if (!token) {
      return;
    }
    window.open(
      buildPreviewUrl(pageId, token, editingSection),
      '_blank',
      'noopener,noreferrer',
    );
  }

  const commandSources = {
    canvasReady: bridge.isReady,
    categories,
    registry,
    blocks: localBlocks,
    pageMenu: flushedPageMenu,
    canInsertType,
    tLabel,
    labels: {
      styles: t('canvas.rail.styles'),
      shortcuts: t('canvas.shortcuts.open'),
      preview: t('canvas.preview'),
      publish: t('canvas.publish'),
    },
    offers: {
      styles: Boolean(siteId) && configuresSite,
      publish: changesLiveSite,
    },
  };
  const commandItems = buildCommandItems(commandSources);

  // Off until the canvas has loaded: a block inserted before the page
  // listens is saved but never drawn, until a reload. The canvas says why
  // meanwhile (canvas-frame.tsx), and the changes themselves wait too
  // (useBlockTreeMutations).
  const insertContent = (
    <>
      <BlockPicker
        categories={categories}
        registry={registry}
        onInsert={(descriptor) => {
          handleInsert(descriptor);
          // On a phone the sheet covers the canvas: the block you just
          // added is what you want to see next.
          if (isNarrow) setMobileSheet(null);
        }}
        canInsert={(descriptor) => canInsertType(descriptor.type)}
        // Dragging onto the canvas needs the canvas beside the palette,
        // which a sheet over it is not.
        drag={
          isNarrow
            ? undefined
            : {
                onDragStart: handleSidebarDragStart,
                onDragMove: handleSidebarDragMove,
                onDragEnd: handleSidebarDragEnd,
              }
        }
        disabled={!bridge.isReady}
      />
      {/* Not inside the section editor: a template dropped into a
          section would be a copy inside a thing that already IS the
          shared original, which is a muddle rather than a feature. */}
      {siteId && !sectionPreview && (
        <TemplatePicker
          siteId={siteId}
          onInsert={handleInsertBlocks}
          disabled={!bridge.isReady}
        />
      )}
    </>
  );

  const layersContent = (
    <CanvasLayersTab
      blocks={localBlocks}
      registry={registry}
      bridge={bridge}
      missingIcons={missingIcons}
      placeholders={placeholders}
      canMoveUp={canMoveSelectedUp}
      canMoveDown={canMoveSelectedDown}
      actions={{
        handleReorder,
        handleReparent,
        handleDuplicateSelected,
        handleRemoveSelected,
        handleMoveSelected,
      }}
    />
  );

  const propertiesContent = (
    /* Where "Properties" in the toolbar puts the keyboard: `tabIndex={-1}`
       so it can take focus without joining the tab order. Inert while the
       canvas loads, like the palette: a property changed now would be
       drawn by a message to a page that is not listening yet. */
    <div
      ref={propertiesPanelRef}
      tabIndex={-1}
      inert={!bridge.isReady}
      className={
        bridge.isReady
          ? 'flex min-h-0 flex-1 flex-col gap-2 outline-none'
          : 'flex min-h-0 flex-1 flex-col gap-2 opacity-60 outline-none'
      }
    >
      {selectedBlock && selectedDescriptor ? (
        <>
          <BlockBreadcrumb
            ancestry={selectedAncestry}
            onSelect={bridge.selectBlock}
          />
          <PropertiesPanel
            block={selectedBlock}
            descriptor={selectedDescriptor}
            isRootLevel={isSelectedRootLevel}
            onChangeProp={handleChangeProp}
            onChangeVariant={handleChangeVariant}
            onChangeAlign={
              // Root level, and the page's own content: the header and
              // footer lists have no per-block wrapper to carry the
              // attribute (they space their blocks with a flex `gap`),
              // and a nested block's width is its container's business.
              isSelectedRootLevel && !editingSection
                ? handleAlignSelected
                : undefined
            }
            onChangeInstanceStyle={handleChangeStyleOverride}
            typeStyle={typeStyle}
            breakpoint={breakpoint}
            sectionEditing={buildSectionEditing(
              sectionEditing,
              selectedBlock.id,
            )}
          />
        </>
      ) : (
        <NoSelectionPanel
          onAddBlock={openInsert}
          pageActions={flushedPageMenu}
          extra={noSelectionExtra}
        />
      )}
    </div>
  );

  const mobileSheetTitle =
    mobileSheet === 'insert'
      ? t('canvas.insertBlock')
      : mobileSheet === 'layers'
        ? t('canvas.layersTitle')
        : t('canvas.propertiesPanel.label');
  const canOpenStyles = Boolean(siteId) && configuresSite;

  return (
    <div className="flex h-dvh flex-col">
      <CanvasTopBar
        backLink={backLink}
        pageSwitcher={pageSwitcher}
        languageSwitcher={languageSwitcher}
        title={title}
        publicationState={publicationState}
        pageMenu={flushedPageMenu}
        // The caller's status records the last write that LANDED; a
        // change still in the debounce has not been written at all, and
        // saying "Draft saved" over it is the one thing the bar must not
        // do.
        statusText={hasPendingWrites ? t('canvas.status.saving') : statusText}
        actions={actions}
        generateAction={
          generation.offered ? (
            // Only the icon on a phone: with its words the bar measured
            // 411px in 390 and pushed Publish off the screen. The words
            // stay for a screen reader.
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={generation.openDialog}
              className="max-sm:px-2"
            >
              <Sparkles />
              <span className="max-sm:sr-only">{t('pageGeneration.open')}</span>
            </Button>
          ) : undefined
        }
        undo={undo}
        redo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        breakpoint={breakpoint}
        onBreakpointChange={setBreakpoint}
        onOpenCommandMenu={() => setIsCommandMenuOpen(true)}
        onOpenPreview={handleOpenPreview}
        onPublish={changesLiveSite ? requestPublish : undefined}
      />
      <div className="flex min-h-0 flex-1">
        {!isNarrow && (
          <>
            <CanvasRail
              openView={leftPanel.openView}
              onToggleView={leftPanel.toggleView}
              showStyles={canOpenStyles}
              onOpenShortcuts={() => setIsShortcutsOpen(true)}
            />
            <CollapsibleSidePanel
              side="left"
              mode="closable"
              id={LEFT_PANEL_ID}
              panel={leftPanel.panel}
              // "Insert block" stays the name of the palette's landmark: it
              // is what tells its "Text" apart from the "Text" in Layers.
              title={
                leftPanel.view === 'insert'
                  ? t('canvas.insertBlock')
                  : t('canvas.layersTitle')
              }
              expandLabel={t('canvas.rail.insert')}
              collapseLabel={t('canvas.rail.close')}
              resizeLabel={t('canvas.rail.resize')}
            >
              {leftPanel.view === 'insert' ? insertContent : layersContent}
            </CollapsibleSidePanel>
          </>
        )}
        {/* The page being edited is the main content; the panels beside
            it are named asides. */}
        <main
          aria-label={t('canvas.landmarks.canvas')}
          className="relative min-h-0 min-w-0 flex-1"
        >
          <CanvasFrame
            // A restore remounts it too: the iframe draws the draft the
            // server renders, and a restored version is a new draft there.
            // Resetting only the local tree left the layers showing the
            // restored page and the canvas the one before it.
            key={`${canvasNonce}:${restoredAt}`}
            pageId={pageId}
            editingSection={editingSection}
            sectionPreview={sectionPreview}
            iframeRef={iframeRef}
            bridge={bridge}
            dropIndicatorTop={liveDropTarget?.indicatorTop}
            dropIndicatorLeft={liveDropTarget?.indicatorLeft}
            dropIndicatorWidth={liveDropTarget?.indicatorWidth}
            breakpoint={breakpoint}
          />
          {generation.offered && bridge.isReady && localBlocks.length === 0 && (
            <EmptyPagePrompt onGenerate={generation.openDialog} />
          )}
          {editingSection && bridge.isReady && (
            <SectionFocusOverlay
              section={editingSection}
              geometry={iframeGeometry}
              rects={rootRects}
              isEmpty={localBlocks.length === 0}
              onAddBlock={openInsert}
            />
          )}
          {selectedBlock &&
            selectedDescriptor &&
            selectedRect &&
            isRectVisibleInIframe(iframeGeometry, selectedRect) && (
              <BlockToolbarOverlay
                iframeRef={iframeRef}
                descriptor={selectedDescriptor}
                rect={selectedRect}
                isRootLevel={isSelectedRootLevel}
                canMoveUp={canMoveSelectedUp}
                canMoveDown={canMoveSelectedDown}
                registry={registry}
                categories={categories}
                onFocusProperties={focusProperties}
                onMakeReusable={
                  // Not in the section editor (a section inside itself) and
                  // not in the header/footer, which are already applied to
                  // every page and have nothing to gain (docs/adr/0059). The
                  // hook itself says no inside a container that may not
                  // hold a section. And only for who may publish: the new
                  // section is published at once (see the hook).
                  !sectionPreview && !editingSection && changesLiveSite
                    ? makeReusable?.openDialog
                    : undefined
                }
                onMoveUp={() => handleMoveSelected(-1)}
                onMoveDown={() => handleMoveSelected(1)}
                onDuplicate={handleDuplicateSelected}
                onDelete={handleRemoveSelected}
                onInsertBefore={(descriptor) =>
                  handleInsertAtRoot(descriptor, 0)
                }
                onInsertAfter={(descriptor) =>
                  handleInsertAtRoot(descriptor, 1)
                }
                onAddChild={handleAddChild}
              />
            )}
          {sidebarDrag && (
            <div
              data-testid="sidebar-drag-ghost"
              className="pointer-events-none fixed z-50 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground shadow-md"
              style={{
                top: sidebarDrag.pointerY + 12,
                left: sidebarDrag.pointerX + 12,
              }}
            >
              {tLabel(sidebarDrag.descriptor.label)}
            </div>
          )}
          {isNarrow && mobileSheet && (
            <MobileSheetPanel
              title={mobileSheetTitle}
              onClose={() => setMobileSheet(null)}
            >
              {mobileSheet === 'insert'
                ? insertContent
                : mobileSheet === 'layers'
                  ? layersContent
                  : propertiesContent}
            </MobileSheetPanel>
          )}
        </main>
        {!isNarrow && (
          <CollapsibleSidePanel
            side="right"
            panel={inspectorPanel}
            title={t('canvas.propertiesPanel.label')}
            expandLabel={t('canvas.propertiesPanel.expand')}
            collapseLabel={t('canvas.propertiesPanel.collapse')}
            resizeLabel={t('canvas.propertiesPanel.resize')}
          >
            {propertiesContent}
          </CollapsibleSidePanel>
        )}
      </div>
      {isNarrow && (
        <MobilePanelBar
          open={mobileSheet}
          onToggle={(sheet) =>
            setMobileSheet((current) => (current === sheet ? null : sheet))
          }
        />
      )}
      <CommandMenu
        open={isCommandMenuOpen}
        onOpenChange={setIsCommandMenuOpen}
        title={t('canvas.command.title')}
        placeholder={t('canvas.command.placeholder')}
        groups={canvasCommandGroups({
          insert: t('canvas.command.insert'),
          layers: t('canvas.command.layers'),
          page: t('canvas.command.page'),
          editor: t('canvas.command.editor'),
        })}
        items={commandItems}
        onRun={(item) =>
          runCommand(item, {
            registry,
            pageMenu: flushedPageMenu,
            insert: handleInsert,
            selectLayer: (blockId) => {
              bridge.selectBlock(blockId);
              bridge.scrollToBlock(blockId);
            },
            // Its own tab: the same page the rail's Styles opens.
            openStyles: () =>
              window.open('/style', '_blank', 'noopener,noreferrer'),
            openShortcuts: () => setIsShortcutsOpen(true),
            openPreview: handleOpenPreview,
            publish: requestPublish,
          })
        }
      />
      <KeyboardShortcutsDialog
        open={isShortcutsOpen}
        onOpenChange={setIsShortcutsOpen}
      />
      {generation.dialog}
      {makeReusable?.dialog}
      <ConfirmActionDialog
        open={isPlaceholderConfirmOpen}
        onOpenChange={setIsPlaceholderConfirmOpen}
        title={t('pageGeneration.publishPlaceholdersTitle')}
        description={t('pageGeneration.publishPlaceholdersBody', {
          count: placeholders.size,
        })}
        actionLabel={t('pageGeneration.publishPlaceholdersAction')}
        onConfirm={handlePublish}
      />
      {children}
    </div>
  );
}
