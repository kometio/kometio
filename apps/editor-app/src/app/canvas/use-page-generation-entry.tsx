import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BlockDescriptor } from '@kometio/block-registry';
import type { Block } from '@kometio/shared-types';
import type { GeneratedPageResult } from '../../lib/page-generation-api-client';
import { useTranslation } from '../../lib/use-translation';
import { pageGenerationStatusQueryOptions } from '../settings/ai-settings-queries';
import { withoutMissingThemeIcons } from '../style/missing-theme-icons';
import { useToast } from '../shell/toast-provider';
import {
  GeneratePageDialog,
  type GenerationMode,
} from './generate-page-dialog';
import { countBlocks, hasId, type IdentifiedBlock } from './use-block-tree';

/** What the page editor tells the canvas about generating its page. */
export interface PageGenerationConfig {
  siteId: string;
  /** The language being edited: the copy is written in it. */
  locale: string;
  /**
   * Why it cannot run on this page. A linked translation shares its blocks
   * with the original: a page generated into it would replace the
   * original's too.
   */
  blockedBy?: 'linked-translation';
  /** A prompt from the New page dialog: the dialog opens with it and starts. */
  initialPrompt?: string;
}

interface Options {
  config: PageGenerationConfig | undefined;
  blocks: Block[];
  registry: readonly BlockDescriptor[];
  isMissingFromTheme: (name: string) => boolean;
  /** Inserts wait for the canvas; a page arriving before it would be dropped. */
  canvasReady: boolean;
  onAppend: (blocks: IdentifiedBlock[]) => void;
  onReplace: (blocks: IdentifiedBlock[]) => void;
}

/**
 * "Generate with AI" for the canvas: whether to offer it, the dialog, and
 * what happens to the page that comes back — icons the theme does not
 * draw taken out, then added or put in place of the page as one step
 * undo takes back.
 */
export function usePageGenerationEntry({
  config,
  blocks,
  registry,
  isMissingFromTheme,
  canvasReady,
  onAppend,
  onReplace,
}: Options) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: status } = useQuery({
    ...pageGenerationStatusQueryOptions(config?.siteId ?? ''),
    enabled: config !== undefined,
  });
  const [isOpen, setIsOpen] = useState(false);
  const [initialPromptUsed, setInitialPromptUsed] = useState(false);

  // A server with nowhere to keep a key cannot generate at all: nothing to
  // offer, and nothing an editor could do about it.
  const offered =
    config !== undefined &&
    status !== undefined &&
    status.availability !== 'server-disabled';
  const unavailable =
    config?.blockedBy ??
    (status?.availability === 'not-configured' ? 'not-configured' : undefined);
  const initialPrompt =
    config?.initialPrompt && !initialPromptUsed && !unavailable
      ? config.initialPrompt
      : undefined;
  const open = isOpen || (initialPrompt !== undefined && canvasReady);

  function handleOpenChange(next: boolean) {
    setIsOpen(next);
    if (!next) setInitialPromptUsed(true);
  }

  function handleGenerated(page: GeneratedPageResult, mode: GenerationMode) {
    const content = withoutMissingThemeIcons(
      page.content,
      registry,
      isMissingFromTheme,
    ).filter(hasId);
    if (mode === 'replace') onReplace(content);
    else onAppend(content);
    setInitialPromptUsed(true);
    toast(
      [
        // Every block, not only the top level: a generated section is
        // often one Columns holding everything else, and "1 block added"
        // undersold it.
        t('pageGeneration.done', { count: countBlocks(content) }),
        // What the model wrote that could not be used is said, not
        // swallowed: a list that silently vanished read as the generator
        // having ignored the prompt.
        page.droppedCount > 0
          ? t('pageGeneration.doneDropped', { count: page.droppedCount })
          : null,
        page.placeholderCount > 0
          ? t('pageGeneration.donePlaceholders', {
              count: page.placeholderCount,
            })
          : null,
      ]
        .filter(Boolean)
        .join(' '),
      'success',
    );
  }

  return {
    offered,
    openDialog: () => setIsOpen(true),
    dialog:
      offered && config ? (
        <GeneratePageDialog
          // A fresh form per page and per language.
          key={`${config.siteId}:${config.locale}`}
          siteId={config.siteId}
          locale={config.locale}
          open={open}
          onOpenChange={handleOpenChange}
          blocks={blocks}
          initialPrompt={initialPrompt}
          unavailable={unavailable}
          onGenerated={handleGenerated}
        />
      ) : null,
  };
}
