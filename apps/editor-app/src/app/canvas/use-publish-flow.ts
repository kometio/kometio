import { useState } from 'react';
import {
  auditBlockProps,
  findPlaceholders,
  type Block,
  type InvalidBlockProps,
} from '@kometio/shared-types';

/**
 * Publishing from the canvas. Two things are asked about before the page goes
 * live, each once and in this order, and everything else publishes at once:
 *
 *  1. what the site would leave out. A block whose props its type's schema
 *     refuses is skipped by the public site, alone, and a visitor sees the
 *     page without it (docs/adr/0124). It is judged here as the site judges it,
 *     on the tree that is about to be published. It is a question and not a
 *     refusal: a page with an unfinished block is a page in progress, and
 *     whoever publishes it may mean to.
 *  2. what a generated page left to fill in, so that an invented name never
 *     goes out unseen.
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
  // Judged when Publish is pressed and not on every keystroke: it is a parse
  // of every block, and the answer is only wanted then.
  const [skipped, setSkipped] = useState<InvalidBlockProps[]>([]);
  const [isSkippedConfirmOpen, setIsSkippedConfirmOpen] = useState(false);

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
    const refused = auditBlockProps(localBlocksRef.current).invalid;
    if (refused.length > 0) {
      setSkipped(refused);
      setIsSkippedConfirmOpen(true);
      return;
    }
    if (placeholders.size > 0) {
      setIsPlaceholderConfirmOpen(true);
      return;
    }
    handlePublish();
  }

  /** "Publish anyway" to the first question: the second is asked if it applies, and otherwise it goes. */
  function confirmSkipped(): void {
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
    skipped,
    isSkippedConfirmOpen,
    setIsSkippedConfirmOpen,
    confirmSkipped,
    handlePublish,
    requestPublish,
  };
}
