import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Block } from '@kometio/shared-types';
import { usePublishFlow } from './use-publish-flow';

// A Column's span is 1 to 12: the site refuses 99 and leaves the block out.
const fine: Block = { id: 'fine', type: 'Column', props: { span: 6 } };
const refused: Block = { id: 'refused', type: 'Column', props: { span: 99 } };
// A Stat left at 0 is what a generated page puts where it would have made up a figure.
const placeholder: Block = {
  id: 'placeholder',
  type: 'Stat',
  props: { value: 0, prefix: '', suffix: '', label: 'Clients' },
};

function setup(blocks: Block[]) {
  const onPublish = vi.fn();
  const flushAll = vi.fn();
  const utils = renderHook(() =>
    usePublishFlow({
      localBlocks: blocks,
      localBlocksRef: { current: blocks },
      flushAll,
      onPublish,
    }),
  );
  return { ...utils, onPublish, flushAll };
}

describe('usePublishFlow', () => {
  it('publishes at once what the site shows in full', () => {
    const { result, onPublish, flushAll } = setup([fine]);

    act(() => result.current.requestPublish());

    expect(result.current.isSkippedConfirmOpen).toBe(false);
    expect(result.current.isPlaceholderConfirmOpen).toBe(false);
    expect(flushAll).toHaveBeenCalledTimes(1);
    expect(onPublish).toHaveBeenCalledWith([fine]);
  });

  it('asks before publishing a block the site would leave out, and says which', () => {
    const { result, onPublish } = setup([fine, refused]);

    act(() => result.current.requestPublish());

    expect(onPublish).not.toHaveBeenCalled();
    expect(result.current.isSkippedConfirmOpen).toBe(true);
    expect(result.current.skipped.map((block) => block.id)).toEqual([
      'refused',
    ]);
    expect(result.current.skipped[0].fields).toEqual(['span']);
  });

  it('publishes when that question is answered', () => {
    const { result, onPublish } = setup([fine, refused]);
    act(() => result.current.requestPublish());

    act(() => result.current.confirmSkipped());

    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it('asks about placeholders only after that, and only if there are any', () => {
    const { result, onPublish } = setup([refused, placeholder]);

    act(() => result.current.requestPublish());
    expect(result.current.isSkippedConfirmOpen).toBe(true);
    expect(result.current.isPlaceholderConfirmOpen).toBe(false);

    act(() => result.current.confirmSkipped());
    expect(onPublish).not.toHaveBeenCalled();
    expect(result.current.isPlaceholderConfirmOpen).toBe(true);

    act(() => result.current.handlePublish());
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it('keeps asking about placeholders when nothing is left out', () => {
    const { result, onPublish } = setup([fine, placeholder]);

    act(() => result.current.requestPublish());

    expect(result.current.isSkippedConfirmOpen).toBe(false);
    expect(result.current.isPlaceholderConfirmOpen).toBe(true);
    expect(onPublish).not.toHaveBeenCalled();
  });

  // The audit is a parse of every block: wanted when Publish is pressed, not
  // on the render that every keystroke causes.
  it('judges the blocks when asked and not before', () => {
    const { result } = setup([refused]);

    expect(result.current.skipped).toEqual([]);
    expect(result.current.isSkippedConfirmOpen).toBe(false);
  });
});
