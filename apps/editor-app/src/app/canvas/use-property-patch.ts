import { useCallback, useEffect, useRef, useState } from 'react';
import {
  hasServerFilledBlock,
  type Block,
  type ResponsiveBlockStyle,
} from '@kometio/shared-types';
import { renderBlockFragment } from '../../lib/block-fragment-api-client';

export interface UsePropertyPatchInput {
  pageId: string;
  /** Set only by the reusable-section editor (docs/adr/0059) — the fragment endpoint then validates the token against the section rather than a page. */
  fragmentSection?: { sectionId: string; locale: string };
  token: string;
  /**
   * Called with the props already merged (the caller owns the tree, see
   * use-block-tree.ts) — it persists the real draft. `changedKey` is the
   * SINGLE key this call is actually changing (`props` stays the whole
   * merged object, still needed for the server-side fragment render) — it
   * lets the caller (canvas-editor-shell.tsx, field-level i18n) route ONLY
   * that key to a translation's overlay when it needs to, without having to
   * narrow `props` itself.
   */
  onSaveDraft: (
    blockId: string,
    changedKey: string,
    props: Record<string, unknown>,
  ) => void;
  /** Like `onSaveDraft` but for the per-instance override (docs/adr/0022), every breakpoint of it (ADR-0047) — a value separate from `props`, replaced wholesale (see use-block-tree.ts's updateBlockStyleOverride) rather than merged field by field. */
  onSaveStyleOverride: (
    blockId: string,
    styleOverride: ResponsiveBlockStyle,
  ) => void;
  /** Like the two above but for `Block.variant` (ADR-0047) — which of the type's declared looks this block wears. */
  onSaveVariant: (blockId: string, variant: string | undefined) => void;
  /** Da usePreviewBridge — invia editor:patch-block all'iframe. */
  patchBlock: (blockId: string, html: string) => void;
  /**
   * The end of a debounce burst — a run of changes on the same timer key
   * with no gap long enough to fire it. It exists for undo: typing "hello"
   * is one thing a person did, not five, so it must be one history entry.
   * The debounce already draws exactly that boundary, so rather than the
   * caller keeping a second, parallel notion of "still editing" (and the
   * two drifting), this hook reports the boundary it already knows.
   *
   * Fires after the burst's save has run, when the resulting state is
   * final. There is deliberately no matching `onBurstStart`: the caller
   * would have to snapshot the state to undo *to*, and no moment during
   * render is reliably "before" for every path — inline typing applies its
   * optimistic update during render and schedules the save in an effect,
   * so a snapshot taken then is already one keystroke late. The history
   * knows what came before; it does not need to be told.
   */
  onBurstEnd?: (timerKey: string) => void;
  /**
   * Resolves once the draft is saved. A block the server fills (a page
   * list, an article's byline) is re-rendered with the answer the server
   * gives for the SAVED page, so its fragment waits for the edit to land:
   * asked for earlier, a list whose term just changed would come back
   * listing the old term.
   */
  whenSaved?: () => Promise<void>;
  debounceMs?: number;
}

export interface UsePropertyPatchResult {
  /** To be called on every property change from the Inspector — one blockId at a time has its own independent timer, so changing one block never resets another's debounce. */
  scheduleChange: (
    blockId: string,
    blockType: string,
    changedKey: string,
    props: Record<string, unknown>,
    children?: Block[],
    presentation?: BlockPresentation,
    /**
     * The block to re-render in the canvas instead of the edited one — its
     * parent, already carrying the edit, when that parent draws from its
     * children's props (`BlockDescriptor.rendersFromChildren`). The draft
     * save is still the edited block's own.
     */
    renderInstead?: Block & { id: string },
  ) => void;
  /**
   * To be called on every `preview:text-changed` (Day 4) — the same
   * per-blockId debounce as `scheduleChange`, but saving only: never
   * render-block-fragment/patchBlock for text, since the DOM inside the
   * iframe already shows what TipTap has typed live, and replacing it with
   * a freshly rendered fragment would tear down the TipTap instance mounted
   * on it mid-keystroke.
   */
  scheduleTextChange: (blockId: string, field: string, text: string) => void;
  /** To be called on every change in the per-instance style popover (docs/adr/0022) — a timer independent of `scheduleChange`'s: a style change and an ordinary property change on the same block, close together, do not cancel each other's debounce. */
  scheduleStyleOverrideChange: (
    blockId: string,
    blockType: string,
    props: Record<string, unknown>,
    styleOverride: ResponsiveBlockStyle,
    children?: Block[],
    variant?: string,
  ) => void;
  /** Picking a variant (ADR-0047) — its own timer again, so choosing a look and typing a label on the same block do not cancel each other. */
  scheduleVariantChange: (
    blockId: string,
    blockType: string,
    props: Record<string, unknown>,
    variant: string | undefined,
    children?: Block[],
    styleOverride?: ResponsiveBlockStyle,
  ) => void;
  /**
   * Fires every still-pending debounced save right now, instead of waiting
   * out its timer — called before Publish (canvas-editor-shell.tsx's own
   * handlePublish) so the last keystroke within the debounce window is
   * never silently dropped from what gets published. Safe to call with
   * nothing pending (no-op).
   */
  /**
   * Fires every pending save NOW. `closeBursts: false` when the page
   * itself is going away: the save still has to happen (it belongs to the
   * page being left), but reporting the burst end would record an undo
   * entry into a history the new page has just reset — an entry pointing
   * at the OLD page's tree.
   */
  flushAll: (options?: { closeBursts?: boolean }) => void;
  /**
   * Whether a change has been made and not yet written — the debounce
   * window, and nothing else.
   *
   * It is the window in which closing the tab loses the last edit without
   * a word, which is what useUnsavedChangesGuard exists to stop. State
   * rather than a ref on purpose: something has to re-render when it
   * flips, or the guard would read whatever it happened to see first.
   */
  hasPendingWrites: boolean;
}

/**
 * What a block wears, as opposed to what it says.
 *
 * Every fragment re-render has to carry it, and forgetting is invisible:
 * the block comes back from the server without its per-instance class or
 * its variant class, so it silently loses its styling in the canvas until
 * the page is reloaded — which is exactly what a prop change did between
 * ADR-0047's first tier and this. The canvas looked wrong and the saved
 * data was fine, the hardest combination to notice.
 */
export interface BlockPresentation {
  styleOverride?: ResponsiveBlockStyle;
  variant?: string;
}

const DEFAULT_DEBOUNCE_MS = 300;

const TEXT_TIMER_PREFIX = 'text:';
const STYLE_TIMER_PREFIX = 'style:';
const VARIANT_TIMER_PREFIX = 'variant:';

/**
 * The inverse of the timer keys below. It lives here rather than at the
 * call site because this file is the one that decides what a timer key
 * looks like — a caller reconstructing the prefixes by hand would be a
 * second copy of that decision, free to drift.
 */
export function blockIdFromTimerKey(timerKey: string): string {
  if (timerKey.startsWith(TEXT_TIMER_PREFIX)) {
    return timerKey.slice(TEXT_TIMER_PREFIX.length);
  }
  if (timerKey.startsWith(STYLE_TIMER_PREFIX)) {
    return timerKey.slice(STYLE_TIMER_PREFIX.length);
  }
  return timerKey;
}

/**
 * On a property change: it saves the draft (debounced, the same
 * `PATCH /pages/:id/draft` as use-page-editor.ts) and in parallel calls
 * render-block-fragment with the new props, then sends `editor:patch-block`
 * — the canvas updates without an iframe reload. See the visual editor
 * plan, Day 3. A renderBlockFragment failure does not block the save (which
 * already happened): the canvas keeps the last good HTML until the next
 * change retries.
 */
export function usePropertyPatch({
  pageId,
  fragmentSection,
  token,
  onSaveDraft,
  onSaveStyleOverride,
  onSaveVariant,
  patchBlock,
  onBurstEnd,
  whenSaved,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UsePropertyPatchInput): UsePropertyPatchResult {
  const timers = useRef(
    new Map<
      string,
      { timeout: ReturnType<typeof setTimeout>; fire: () => void }
    >(),
  );
  const [hasPendingWrites, setHasPendingWrites] = useState(false);

  // A debounce key distinct from a plain blockId (see scheduleTextChange
  // below) — a non-text property change and text being edited on the same
  // block have independent timers, and neither resets the other's debounce.
  // `fire` is kept alongside the timeout (not just the latter) so flushAll
  // below can invoke it immediately rather than waiting for it to expire.
  function schedule(timerKey: string, fire: () => void): void {
    const existing = timers.current.get(timerKey);
    if (existing) {
      clearTimeout(existing.timeout);
    }
    const timeout = setTimeout(() => {
      timers.current.delete(timerKey);
      setHasPendingWrites(timers.current.size > 0);
      fire();
      onBurstEnd?.(timerKey);
    }, debounceMs);
    timers.current.set(timerKey, { timeout, fire });
    setHasPendingWrites(true);
  }

  const flushAll = useCallback(
    ({ closeBursts = true }: { closeBursts?: boolean } = {}) => {
      const pending = [...timers.current.entries()];
      timers.current.clear();
      setHasPendingWrites(false);
      for (const [timerKey, { timeout, fire }] of pending) {
        clearTimeout(timeout);
        fire();
        // A flushed burst has ended just as surely as an expired one — undo
        // must see it, or publishing mid-burst would leave that edit out of
        // the history for good.
        if (closeBursts) {
          onBurstEnd?.(timerKey);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onBurstEnd is redefined on every render but only ever reads refs; depending on it would break flushAll's stable identity, which handlePublish and the page-change flush both rely on.
    [],
  );

  /**
   * On the way out, fire what is pending rather than dropping it.
   *
   * This used to be a cleanup that called clearTimeout on every timer and
   * emptied the map — which meant leaving the editor by a link threw away
   * whatever was still inside the 300ms debounce, silently. The app is
   * still running when that happens, so the save reaches the server exactly
   * as it would have when the timer expired.
   *
   * It has to live HERE, next to flushAll, and not in a caller: effect
   * cleanups run in declaration order within a component, so a flush added
   * by a hook further down was running after this one had already cleared
   * the timers and found nothing to do. Caught by a test, not by reading.
   *
   * `closeBursts: false` because the history is going away with the
   * component, and an undo entry recorded on the way out has nothing left
   * to undo into.
   */
  useEffect(() => {
    return () => {
      flushAll({ closeBursts: false });
    };
  }, [flushAll]);

  const scheduleChange = useCallback(
    (
      blockId: string,
      blockType: string,
      changedKey: string,
      props: Record<string, unknown>,
      children?: Block[],
      presentation?: BlockPresentation,
      renderInstead?: Block & { id: string },
    ) => {
      schedule(blockId, () => {
        onSaveDraft(blockId, changedKey, props);
        const rendered = renderInstead
          ? {
              blockId: renderInstead.id,
              blockType: renderInstead.type,
              props: renderInstead.props,
              children: renderInstead.children,
              styleOverride: renderInstead.styleOverride,
              variant: renderInstead.variant,
            }
          : { blockId, blockType, props, children, ...presentation };
        const render = () =>
          renderBlockFragment({
            pageId,
            ...(fragmentSection ?? {}),
            token,
            ...rendered,
          })
            .then((html) => patchBlock(rendered.blockId, html))
            .catch(() => {
              /* the draft is already saved above — a failure here only leaves the canvas one change behind visually, it loses no data. */
            });
        const answeredByServer =
          whenSaved &&
          hasServerFilledBlock([
            {
              type: rendered.blockType,
              props: rendered.props,
              children: rendered.children,
            },
          ]);
        if (answeredByServer) {
          void whenSaved().then(render);
        } else {
          void render();
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `schedule` is redefined on every render but reads only `timers` (a ref, stable) and `debounceMs` (already an explicit dependency) — including it would break scheduleChange's stable identity for no benefit.
    [
      pageId,
      fragmentSection,
      token,
      onSaveDraft,
      patchBlock,
      whenSaved,
      debounceMs,
    ],
  );

  const scheduleTextChange = useCallback(
    (blockId: string, field: string, text: string) => {
      schedule(`${TEXT_TIMER_PREFIX}${blockId}`, () => {
        onSaveDraft(blockId, field, { [field]: text });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see scheduleChange above.
    [onSaveDraft, debounceMs],
  );

  const scheduleStyleOverrideChange = useCallback(
    (
      blockId: string,
      blockType: string,
      props: Record<string, unknown>,
      styleOverride: ResponsiveBlockStyle,
      children?: Block[],
      variant?: string,
    ) => {
      schedule(`${STYLE_TIMER_PREFIX}${blockId}`, () => {
        onSaveStyleOverride(blockId, styleOverride);
        renderBlockFragment({
          pageId,
          ...(fragmentSection ?? {}),
          token,
          blockId,
          blockType,
          props,
          children,
          styleOverride,
          variant,
        })
          .then((html) => patchBlock(blockId, html))
          .catch(() => {
            /* the draft is already saved above — see the same comment on scheduleChange. */
          });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see scheduleChange above.
    [
      pageId,
      fragmentSection,
      token,
      onSaveStyleOverride,
      patchBlock,
      debounceMs,
    ],
  );

  const scheduleVariantChange = useCallback(
    (
      blockId: string,
      blockType: string,
      props: Record<string, unknown>,
      variant: string | undefined,
      children?: Block[],
      styleOverride?: ResponsiveBlockStyle,
    ) => {
      schedule(`${VARIANT_TIMER_PREFIX}${blockId}`, () => {
        onSaveVariant(blockId, variant);
        renderBlockFragment({
          pageId,
          ...(fragmentSection ?? {}),
          token,
          blockId,
          blockType,
          props,
          children,
          styleOverride,
          variant,
        })
          .then((html) => patchBlock(blockId, html))
          .catch(() => {
            /* the draft is already saved above — see the same comment on scheduleChange. */
          });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see scheduleChange above.
    [pageId, fragmentSection, token, onSaveVariant, patchBlock, debounceMs],
  );

  return {
    scheduleChange,
    scheduleTextChange,
    scheduleStyleOverrideChange,
    scheduleVariantChange,
    flushAll,
    hasPendingWrites,
  };
}
