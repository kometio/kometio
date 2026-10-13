import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { PUBLIC_SITE_URL } from '../../lib/public-site-url';
import { useTranslation } from '../../lib/use-translation';
import { usePageList } from '../pages/page-list-context';
import { useIconList } from '../style/icon-list-context';
import { findMissingThemeIcons } from '../style/missing-theme-icons';
import { useUnsavedChangesGuard } from '../common/use-unsaved-changes-guard';
import { ConfirmActionDialog } from '../common/confirm-action-dialog';
import { useApplySavedInterfaceLanguage } from '../account/use-interface-language';
import { useCurrentSession } from '../auth/use-current-session';
import { BlockToolbarOverlay } from './block-toolbar-overlay';
import type { Breakpoint } from './breakpoint-selector';
import { CanvasFrame } from './canvas-frame';
import { describeSelection } from './canvas-selection';
import { CanvasTopBar } from './canvas-top-bar';
import { CanvasRail, LEFT_PANEL_ID } from './canvas-rail';
import type { CanvasEditorShellProps } from './canvas-editor-shell-props';
import { CanvasInsertContent } from './canvas-insert-content';
import { CanvasPropertiesContent } from './canvas-properties-content';
import { CollapsibleSidePanel } from './collapsible-side-panel';
import { CanvasLayersTab } from './canvas-layers-tab';
import { CommandMenu } from '../common/command-menu';
import { EmptyPagePrompt } from './empty-page-prompt';
import { KeyboardShortcutsDialog } from './keyboard-shortcuts-dialog';
import { MobilePanelBar, MobileSheetPanel } from './mobile-panel-sheet';
import { SectionFocusOverlay } from './section-focus-overlay';
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
import { usePageGenerationEntry } from './use-page-generation-entry';
import { useCanvasCommandMenu } from './use-canvas-command-menu';
import { usePlacementRefusedNotice } from './use-placement-refused-notice';
import { skippedBlockNames } from './skipped-block-names';
import { usePublishFlow } from './use-publish-flow';
import { useSelectedBlockEditing } from './use-selected-block-editing';
import { usePreviewBridge } from './use-preview-bridge';
import { useSidebarDrag } from './use-sidebar-drag';
import { useTextEdit } from './use-text-edit';

export type { CanvasEditorShellProps } from './canvas-editor-shell-props';

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
    skipped,
    isSkippedConfirmOpen,
    setIsSkippedConfirmOpen,
    confirmSkipped,
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
  const notifyPlacementRefused = usePlacementRefusedNotice(registry);

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

  const commandMenu = useCanvasCommandMenu({
    pageMenu,
    flushAll,
    token,
    pageId,
    editingSection,
    bridge,
    categories,
    registry,
    blocks: localBlocks,
    canInsertType,
    siteId,
    configuresSite,
    changesLiveSite,
    handleInsert,
    requestPublish,
    openShortcuts: () => setIsShortcutsOpen(true),
  });
  const { flushedPageMenu, handleOpenPreview } = commandMenu;

  // Off until the canvas has loaded: a block inserted before the page
  // listens is saved but never drawn, until a reload. The canvas says why
  // meanwhile (canvas-frame.tsx), and the changes themselves wait too
  // (useBlockTreeMutations).
  const insertContent = (
    <CanvasInsertContent
      categories={categories}
      registry={registry}
      ready={bridge.isReady}
      canInsertType={canInsertType}
      onInsert={(descriptor) => {
        handleInsert(descriptor);
        // On a phone the sheet covers the canvas: the block you just
        // added is what you want to see next.
        if (isNarrow) setMobileSheet(null);
      }}
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
      templates={
        siteId && !sectionPreview
          ? { siteId, onInsert: handleInsertBlocks }
          : undefined
      }
    />
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
    <CanvasPropertiesContent
      panelRef={propertiesPanelRef}
      ready={bridge.isReady}
      selectedBlock={selectedBlock}
      selectedDescriptor={selectedDescriptor}
      selectedAncestry={selectedAncestry}
      isRootLevel={isSelectedRootLevel}
      onSelectBlock={bridge.selectBlock}
      onChangeProp={handleChangeProp}
      onChangeVariant={handleChangeVariant}
      onChangeAlign={
        // Root level, and the page's own content: the header and footer
        // lists have no per-block wrapper to carry the attribute (they
        // space their blocks with a flex `gap`), and a nested block's
        // width is its container's business.
        isSelectedRootLevel && !editingSection ? handleAlignSelected : undefined
      }
      onChangeInstanceStyle={handleChangeStyleOverride}
      typeStyle={typeStyle}
      breakpoint={breakpoint}
      sectionEditing={buildSectionEditing(sectionEditing, selectedBlock?.id)}
      onAddBlock={openInsert}
      pageActions={flushedPageMenu}
      noSelectionExtra={noSelectionExtra}
    />
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
        groups={commandMenu.groups}
        items={commandMenu.items}
        onRun={commandMenu.run}
      />
      <KeyboardShortcutsDialog
        open={isShortcutsOpen}
        onOpenChange={setIsShortcutsOpen}
      />
      {generation.dialog}
      {makeReusable?.dialog}
      <ConfirmActionDialog
        open={isSkippedConfirmOpen}
        onOpenChange={setIsSkippedConfirmOpen}
        title={t('canvas.publishSkipped.title')}
        description={t('canvas.publishSkipped.body', {
          count: skipped.length,
          names: skippedBlockNames(skipped, registry, tLabel),
        })}
        actionLabel={t('canvas.publishSkipped.action')}
        actionVariant="default"
        onConfirm={confirmSkipped}
      />
      <ConfirmActionDialog
        open={isPlaceholderConfirmOpen}
        onOpenChange={setIsPlaceholderConfirmOpen}
        title={t('pageGeneration.publishPlaceholdersTitle')}
        description={t('pageGeneration.publishPlaceholdersBody', {
          count: placeholders.size,
        })}
        actionLabel={t('pageGeneration.publishPlaceholdersAction')}
        actionVariant="default"
        onConfirm={handlePublish}
      />
      {children}
    </div>
  );
}
