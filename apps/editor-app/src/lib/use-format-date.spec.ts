import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useFormatDate } from './use-format-date';

describe('useFormatDate', () => {
  it('names the month, so the day and the month cannot be read the wrong way round', () => {
    const { result } = renderHook(() => useFormatDate());

    // The test setup runs the editor in Italian.
    expect(result.current('2026-09-12T10:00:00Z')).toBe('12 set 2026');
  });

  it('adds the time where the moment matters, and can say the time alone', () => {
    const dateTime = renderHook(() => useFormatDate('dateTime')).result;
    const time = renderHook(() => useFormatDate('time')).result;
    const moment = new Date(2026, 8, 12, 15, 7);

    expect(dateTime.current(moment)).toBe('12 set 2026, 15:07');
    expect(time.current(moment)).toBe('15:07');
  });

  it('says nothing for a value that is not a date', () => {
    const { result } = renderHook(() => useFormatDate());

    expect(result.current('not a date')).toBeNull();
  });
});
