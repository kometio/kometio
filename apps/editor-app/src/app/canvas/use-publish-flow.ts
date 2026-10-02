import { useState } from 'react';
import { findPlaceholders, type Block } from '@kometio/shared-types';

/**
 * Publishing from the canvas. What a generated page left to fill in is
 * asked about before it goes live, so an invented name never goes out
 * unseen; everything else publishes at once.
 */
export function usePublishFlow({
  localBlocks,
  localBlocksRef,
  flushAll,
  onPublish,
}: {
  localBlocks: Block[];
  localBlocksRef: { readonly current: Block[] };
  /** Sends at once any change still waiting out the debounce. */
  flushAll: () => void;
  onPublish: (blocks: Block[]) => unknown;
}) {
  // Marked in Layers too, which is why the set is returned.
  const placeholders = findPlaceholders(localBlocks);
  const [isPlaceholderConfirmOpen, setIsPlaceholderConfirmOpen] =
    useState(false);

  /**
   * Fires any still-pending debounced save NOW instead of waiting out its
   * timer, so the last keystroke is in the save queue before publishing
   * starts. Each editor's `onPublish` then waits for that queue to drain
   * before it publishes (publishWhenSaved in the page editor,
   * useDraftEditor for headers, footers and sections): the tree cannot be
   * re-sent directly, because a translatable field's value cannot be told
   * apart from the shared structure in the merged tree shown here.
   */
  function handlePublish(): void {
    flushAll();
    onPublish(localBlocksRef.current);
  }

  function requestPublish(): void {
    if (placeholders.size > 0) {
      setIsPlaceholderConfirmOpen(true);
      return;
    }
    handlePublish();
  }

  return {
    placeholders,
    isPlaceholderConfirmOpen,
    setIsPlaceholderConfirmOpen,
    handlePublish,
    requestPublish,
  };
}
