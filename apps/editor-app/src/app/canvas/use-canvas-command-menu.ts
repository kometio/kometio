import type { Block } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import { useTranslation } from '../../lib/use-translation';
import type { CommandGroup, CommandItem } from '../common/command-menu';
import type { BlockPickerCategory } from './block-picker';
import {
  buildCommandItems,
  canvasCommandGroups,
  runCommand,
} from './canvas-commands';
import { buildPreviewUrl, type EditingSection } from './canvas-frame';
import type { CanvasPageMenuItem } from './canvas-top-bar';
import type { PreviewBridgeState } from './use-preview-bridge';

export interface CanvasCommandMenuInput {
  /** The page's own actions, as the caller gave them: this is where each one is made to send the debounced change first. */
  pageMenu: CanvasPageMenuItem[] | undefined;
  /** Sends at once any change still waiting out the debounce. */
  flushAll: () => void;
  /** The preview token, once it has been minted. */
  token: string | null;
  pageId: string;
  editingSection: EditingSection | undefined;
  bridge: PreviewBridgeState;
  categories: BlockPickerCategory[];
  registry: BlockDescriptor[];
  blocks: Block[];
  canInsertType: (type: string) => boolean;
  siteId: string | undefined;
  /** Who may do what (docs/roles.md): the menu offers only what this person may do. */
  configuresSite: boolean;
  changesLiveSite: boolean;
  handleInsert: (descriptor: BlockDescriptor) => void;
  requestPublish: () => void;
  openShortcuts: () => void;
}

export interface CanvasCommandMenu {
  /** The page's actions, each of which flushes first. Also what the top bar and the Properties panel show. */
  flushedPageMenu: CanvasPageMenuItem[] | undefined;
  /** Opens the preview URL in a new tab. */
  handleOpenPreview: () => void;
  groups: CommandGroup[];
  items: CommandItem[];
  /** What choosing an entry does. */
  run: (item: CommandItem) => void;
}

/**
 * What the canvas's command menu lists and does, and the page actions the
 * top bar and the Properties panel share with it.
 *
 * Moved out of the shell as it was (canvas-commands.tsx holds the list and
 * the dispatch; this holds what they are built from, which is the shell's
 * state): the shell is where the editor's hooks meet, and this part of it
 * needed seven of them and none of the others.
 */
export function useCanvasCommandMenu({
  pageMenu,
  flushAll,
  token,
  pageId,
  editingSection,
  bridge,
  categories,
  registry,
  blocks,
  canInsertType,
  siteId,
  configuresSite,
  changesLiveSite,
  handleInsert,
  requestPublish,
  openShortcuts,
}: CanvasCommandMenuInput): CanvasCommandMenu {
  const { t, tLabel } = useTranslation();

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

  const items = buildCommandItems({
    canvasReady: bridge.isReady,
    categories,
    registry,
    blocks,
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
  });

  const groups = canvasCommandGroups({
    insert: t('canvas.command.insert'),
    layers: t('canvas.command.layers'),
    page: t('canvas.command.page'),
    editor: t('canvas.command.editor'),
  });

  const run = (item: CommandItem): void =>
    runCommand(item, {
      registry,
      pageMenu: flushedPageMenu,
      insert: handleInsert,
      selectLayer: (blockId) => {
        bridge.selectBlock(blockId);
        bridge.scrollToBlock(blockId);
      },
      // Its own tab: the same page the rail's Styles opens.
      openStyles: () => window.open('/style', '_blank', 'noopener,noreferrer'),
      openShortcuts,
      openPreview: handleOpenPreview,
      publish: requestPublish,
    });

  return { flushedPageMenu, handleOpenPreview, groups, items, run };
}
