import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSingleFlightSave } from './use-single-flight-save';

describe('useSingleFlightSave', () => {
  /*
   * A settled queue is not a saved draft. "Save as template" asks the
   * server to copy the page, so it has to know when the last edit never got
   * there — and that a later successful save, which sends the whole value,
   * covers it.
   */
  it('says the last save failed until a later one succeeds', async () => {
    const save = vi
      .fn<(value: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useSingleFlightSave(save));
    expect(result.current.lastSaveFailed()).toBe(false);

    await act(async () => {
      result.current.schedule('first');
      await result.current.whenSettled();
    });
    expect(result.current.lastSaveFailed()).toBe(true);

    await act(async () => {
      result.current.schedule('second');
      await result.current.whenSettled();
    });
    expect(result.current.lastSaveFailed()).toBe(false);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('keeps the queue moving after a failure: the value scheduled meanwhile is still sent', async () => {
    let rejectFirst: (error: Error) => void = () => undefined;
    const save = vi
      .fn<(value: string) => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useSingleFlightSave(save));

    await act(async () => {
      result.current.schedule('first');
      result.current.schedule('second');
      rejectFirst(new Error('network'));
      await result.current.whenSettled();
    });

    expect(save).toHaveBeenNthCalledWith(2, 'second');
    expect(result.current.lastSaveFailed()).toBe(false);
  });
});
