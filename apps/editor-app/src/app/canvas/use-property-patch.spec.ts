import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as blockFragmentApi from '../../lib/block-fragment-api-client';
import { blockIdFromTimerKey, usePropertyPatch } from './use-property-patch';

vi.mock('../../lib/block-fragment-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../lib/block-fragment-api-client')
    >();
  return { ...actual, renderBlockFragment: vi.fn() };
});

describe('usePropertyPatch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Cleared HERE and not only in afterEach: testing-library's automatic
    // unmount runs after this describe's own afterEach, and unmounting now
    // fires whatever is still pending — so a call made during the previous
    // test's teardown would otherwise be counted against this one.
    vi.clearAllMocks();
    // Every test needs one now, whether or not it cares about the
    // fragment: unmounting fires what is still pending (see the unmount
    // effect), so a test that schedules a change and ends inside the
    // debounce window reaches this call on the way out.
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<div>patched</div>',
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  function setup(debounceMs = 300) {
    const onSaveDraft = vi.fn();
    const onSaveStyleOverride = vi.fn();
    const onSaveVariant = vi.fn();
    const patchBlock = vi.fn();
    const { result, unmount } = renderHook(() =>
      usePropertyPatch({
        pageId: 'page-1',
        token: 'tok',
        onSaveDraft,
        onSaveStyleOverride,
        onSaveVariant,
        patchBlock,
        debounceMs,
      }),
    );
    return {
      result,
      unmount,
      onSaveDraft,
      onSaveStyleOverride,
      onSaveVariant,
      patchBlock,
    };
  }

  function setupWithBursts(debounceMs = 300) {
    const ends: string[] = [];
    const { result, unmount } = renderHook(() =>
      usePropertyPatch({
        pageId: 'page-1',
        token: 'tok',
        onSaveDraft: vi.fn(),
        onSaveStyleOverride: vi.fn(),
        onSaveVariant: vi.fn(),
        patchBlock: vi.fn(),
        onBurstEnd: (key) => ends.push(key),
        debounceMs,
      }),
    );
    return { result, ends, unmount };
  }

  /*
   * Leaving the editor inside the debounce used to throw the change away:
   * the unmount cleanup called clearTimeout on every timer and emptied the
   * map. The app is still running when a person follows a link, so the
   * save can and must still happen.
   */
  it('fires a pending save on unmount instead of dropping it', () => {
    const { result, onSaveDraft, unmount } = setup();

    act(() => {
      result.current.scheduleChange('hero-1', 'Hero', 'title', {
        title: 'Scritto e subito via',
      });
    });
    expect(onSaveDraft).not.toHaveBeenCalled();

    act(() => {
      unmount();
    });

    expect(onSaveDraft).toHaveBeenCalledWith('hero-1', 'title', {
      title: 'Scritto e subito via',
    });
  });

  /*
   * ...but it must not record an undo entry on the way out: the history is
   * going away with the component, and an entry made now has nothing left
   * to undo into.
   */
  it('does not close the burst on unmount', () => {
    const { result, ends, unmount } = setupWithBursts();

    act(() => {
      result.current.scheduleChange('hero-1', 'Hero', 'title', { title: 'x' });
    });
    act(() => {
      unmount();
    });

    expect(ends).toEqual([]);
  });

  it('does nothing before the debounce window elapses', () => {
    const { result, onSaveDraft } = setup();

    act(() => {
      result.current.scheduleChange('hero-1', 'Hero', 'title', {
        title: 'New',
      });
    });
    act(() => {
      vi.advanceTimersByTime(299);
    });

    expect(onSaveDraft).not.toHaveBeenCalled();
  });

  it('saves the draft and renders+patches the fragment once the debounce elapses', async () => {
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<div>patched</div>',
    );
    const { result, onSaveDraft, patchBlock } = setup();

    act(() => {
      result.current.scheduleChange('hero-1', 'Hero', 'title', {
        title: 'New',
      });
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    // Let the microtask of the Promise resolved inside the timer run.
    await act(async () => {
      await Promise.resolve();
    });

    expect(onSaveDraft).toHaveBeenCalledWith('hero-1', 'title', {
      title: 'New',
    });
    expect(blockFragmentApi.renderBlockFragment).toHaveBeenCalledWith({
      pageId: 'page-1',
      token: 'tok',
      blockId: 'hero-1',
      blockType: 'Hero',
      props: { title: 'New' },
    });
    expect(patchBlock).toHaveBeenCalledWith('hero-1', '<div>patched</div>');
  });

  it('resets the debounce timer on a rapid second change to the same block', () => {
    const { result, onSaveDraft } = setup();

    act(() => {
      result.current.scheduleChange('hero-1', 'Hero', 'title', { title: 'A' });
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    act(() => {
      result.current.scheduleChange('hero-1', 'Hero', 'title', { title: 'AB' });
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // The first timer was cancelled by the second change — only 400ms in
    // total have passed since the SECOND change (200ms), not yet the 300ms.
    expect(onSaveDraft).not.toHaveBeenCalled();
  });

  it('tracks each block id with its own independent timer', () => {
    const { result, onSaveDraft } = setup();

    act(() => {
      result.current.scheduleChange('hero-1', 'Hero', 'title', { title: 'A' });
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    act(() => {
      result.current.scheduleChange('text-1', 'Text', 'body', { body: 'B' });
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    // hero-1's own 300ms have elapsed (150 + 150); text-1's own 150ms have not.
    expect(onSaveDraft).toHaveBeenCalledWith('hero-1', 'title', { title: 'A' });
    expect(onSaveDraft).not.toHaveBeenCalledWith('text-1', 'body', {
      body: 'B',
    });
  });

  it('scheduleTextChange saves the draft after its own debounce, without touching render-block-fragment', async () => {
    const { result, onSaveDraft, patchBlock } = setup();

    act(() => {
      result.current.scheduleTextChange('hero-1', 'title', 'Nuovo titolo');
    });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(onSaveDraft).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(onSaveDraft).toHaveBeenCalledWith('hero-1', 'title', {
      title: 'Nuovo titolo',
    });
    expect(blockFragmentApi.renderBlockFragment).not.toHaveBeenCalled();
    expect(patchBlock).not.toHaveBeenCalled();
  });

  it('scheduleChange and scheduleTextChange on the same block have independent timers', () => {
    const { result, onSaveDraft } = setup();

    act(() => {
      result.current.scheduleChange('hero-1', 'Hero', 'title', {
        title: 'Prop change',
      });
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    act(() => {
      result.current.scheduleTextChange('hero-1', 'subtitle', 'Text change');
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // scheduleChange's own 300ms have elapsed (200 + 100); scheduleTextChange's
    // own 100ms have not — the two timers didn't reset each other.
    expect(onSaveDraft).toHaveBeenCalledWith('hero-1', 'title', {
      title: 'Prop change',
    });
    expect(onSaveDraft).not.toHaveBeenCalledWith('hero-1', 'subtitle', {
      subtitle: 'Text change',
    });
  });

  it('still saves the draft even when renderBlockFragment rejects', async () => {
    vi.mocked(blockFragmentApi.renderBlockFragment).mockRejectedValue(
      new Error('boom'),
    );
    const { result, onSaveDraft, patchBlock } = setup();

    act(() => {
      result.current.scheduleChange('hero-1', 'Hero', 'title', {
        title: 'New',
      });
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(onSaveDraft).toHaveBeenCalledWith('hero-1', 'title', {
      title: 'New',
    });
    expect(patchBlock).not.toHaveBeenCalled();
  });

  it('flushAll fires every pending save immediately, without waiting out its debounce', () => {
    const { result, onSaveDraft } = setup();

    act(() => {
      result.current.scheduleChange('hero-1', 'Hero', 'title', { title: 'A' });
      result.current.scheduleTextChange('text-1', 'body', 'B');
    });
    expect(onSaveDraft).not.toHaveBeenCalled();

    act(() => {
      result.current.flushAll();
    });

    expect(onSaveDraft).toHaveBeenCalledWith('hero-1', 'title', { title: 'A' });
    expect(onSaveDraft).toHaveBeenCalledWith('text-1', 'body', { body: 'B' });
  });

  it('flushAll does nothing when nothing is pending', () => {
    const { result, onSaveDraft } = setup();

    act(() => {
      result.current.flushAll();
    });

    expect(onSaveDraft).not.toHaveBeenCalled();
  });

  it("a change scheduled again after flushAll gets its own fresh debounce window (flushAll doesn't leave a stale timer key behind)", () => {
    const { result, onSaveDraft } = setup();

    act(() => {
      result.current.scheduleChange('hero-1', 'Hero', 'title', { title: 'A' });
      result.current.flushAll();
      result.current.scheduleChange('hero-1', 'Hero', 'title', { title: 'B' });
    });
    expect(onSaveDraft).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onSaveDraft).toHaveBeenCalledTimes(2);
    expect(onSaveDraft).toHaveBeenLastCalledWith('hero-1', 'title', {
      title: 'B',
    });
  });

  it('scheduleStyleOverrideChange saves the override and renders+patches the fragment once the debounce elapses', async () => {
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<div>patched</div>',
    );
    const { result, onSaveStyleOverride, patchBlock } = setup();

    act(() => {
      result.current.scheduleStyleOverrideChange(
        'button-1',
        'Button',
        { label: 'Clicca qui' },
        { base: { backgroundColor: '#ff0000' } },
      );
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(onSaveStyleOverride).toHaveBeenCalledWith('button-1', {
      base: { backgroundColor: '#ff0000' },
    });
    expect(blockFragmentApi.renderBlockFragment).toHaveBeenCalledWith({
      pageId: 'page-1',
      token: 'tok',
      blockId: 'button-1',
      blockType: 'Button',
      props: { label: 'Clicca qui' },
      children: undefined,
      styleOverride: { base: { backgroundColor: '#ff0000' } },
    });
    expect(patchBlock).toHaveBeenCalledWith('button-1', '<div>patched</div>');
  });

  it('scheduleChange and scheduleStyleOverrideChange on the same block have independent timers', () => {
    const { result, onSaveDraft, onSaveStyleOverride } = setup();

    act(() => {
      result.current.scheduleChange('button-1', 'Button', 'label', {
        label: 'Prop change',
      });
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    act(() => {
      result.current.scheduleStyleOverrideChange(
        'button-1',
        'Button',
        { label: 'Prop change' },
        { base: { backgroundColor: '#ff0000' } },
      );
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(onSaveDraft).toHaveBeenCalledWith('button-1', 'label', {
      label: 'Prop change',
    });
    expect(onSaveStyleOverride).not.toHaveBeenCalled();
  });

  // The burst boundary is what makes undo usable: typing "hello" is one
  // thing a person did, not five. These callbacks are how the debounce —
  // which already draws that boundary — reports it.
  describe('burst boundaries', () => {
    it('closes a run of changes once, not once per change', () => {
      const { result, ends } = setupWithBursts();

      act(() => {
        result.current.scheduleChange('a', 'Hero', 'title', { title: 'h' });
        result.current.scheduleChange('a', 'Hero', 'title', { title: 'he' });
        result.current.scheduleChange('a', 'Hero', 'title', { title: 'hel' });
      });
      expect(ends).toEqual([]);

      act(() => void vi.advanceTimersByTime(300));
      expect(ends).toEqual(['a']);
    });

    it('closes a second burst once the first has expired', () => {
      const { result, ends } = setupWithBursts();

      act(() => result.current.scheduleChange('a', 'Hero', 'title', {}));
      act(() => void vi.advanceTimersByTime(300));
      act(() => result.current.scheduleChange('a', 'Hero', 'title', {}));
      act(() => void vi.advanceTimersByTime(300));

      expect(ends).toEqual(['a', 'a']);
    });

    // Text, props and style have independent timers by design, so one
    // must never close another's burst.
    it('keeps a burst per timer key, not per block', () => {
      const { result, ends } = setupWithBursts();

      act(() => {
        result.current.scheduleChange('a', 'Hero', 'title', {});
        result.current.scheduleTextChange('a', 'title', 'x');
        result.current.scheduleStyleOverrideChange(
          'a',
          'Hero',
          {},
          {
            base: {},
          },
        );
      });
      act(() => void vi.advanceTimersByTime(300));

      expect([...ends].sort()).toEqual(['a', 'style:a', 'text:a']);
    });

    // Publishing mid-burst flushes the pending save; if that did not also
    // close the burst, the edit would never reach the history at all.
    it('closes every open burst on flushAll', () => {
      const { result, ends } = setupWithBursts();

      act(() => {
        result.current.scheduleChange('a', 'Hero', 'title', {});
        result.current.scheduleTextChange('b', 'body', 'x');
      });
      act(() => result.current.flushAll());

      expect([...ends].sort()).toEqual(['a', 'text:b']);
    });
  });

  describe('blockIdFromTimerKey', () => {
    it('recovers the block id from every key shape', () => {
      expect(blockIdFromTimerKey('abc')).toBe('abc');
      expect(blockIdFromTimerKey('text:abc')).toBe('abc');
      expect(blockIdFromTimerKey('style:abc')).toBe('abc');
    });
  });

  describe('a block the server fills', () => {
    function setupWaitingForSave() {
      let settle: () => void = () => undefined;
      const whenSaved = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            settle = resolve;
          }),
      );
      const { result } = renderHook(() =>
        usePropertyPatch({
          pageId: 'page-1',
          token: 'tok',
          onSaveDraft: vi.fn(),
          onSaveStyleOverride: vi.fn(),
          onSaveVariant: vi.fn(),
          patchBlock: vi.fn(),
          whenSaved,
          debounceMs: 300,
        }),
      );
      return { result, whenSaved, settle: () => settle() };
    }

    /*
     * Its answer comes from the page as saved (buildFragmentBlock): asked
     * for before the save lands, a list whose term just changed came back
     * listing the old term.
     */
    it('is re-rendered only once the edit is saved', async () => {
      const { result, whenSaved, settle } = setupWaitingForSave();

      act(() => {
        result.current.scheduleChange('grid-1', 'PageGrid', 'termId', {
          termId: 'term-2',
        });
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(whenSaved).toHaveBeenCalled();
      expect(blockFragmentApi.renderBlockFragment).not.toHaveBeenCalled();

      await act(async () => {
        settle();
        await Promise.resolve();
      });

      expect(blockFragmentApi.renderBlockFragment).toHaveBeenCalledWith(
        expect.objectContaining({ blockId: 'grid-1', blockType: 'PageGrid' }),
      );
    });

    it('waits for a container holding one, too — but not for an ordinary block', () => {
      const { result, whenSaved } = setupWaitingForSave();

      act(() => {
        result.current.scheduleChange('hero-1', 'Hero', 'title', {
          title: 'Subito',
        });
        vi.advanceTimersByTime(300);
      });
      expect(whenSaved).not.toHaveBeenCalled();
      expect(blockFragmentApi.renderBlockFragment).toHaveBeenCalledTimes(1);

      act(() => {
        result.current.scheduleChange(
          'box-1',
          'Container',
          'gap',
          { gap: 'lg' },
          [{ id: 'meta', type: 'ArticleMeta', props: {} }],
        );
        vi.advanceTimersByTime(300);
      });
      expect(whenSaved).toHaveBeenCalledTimes(1);
      expect(blockFragmentApi.renderBlockFragment).toHaveBeenCalledTimes(1);
    });
  });
});
