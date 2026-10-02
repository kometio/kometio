import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { MediaPickerContext, useMediaPicker } from './media-picker-context';

describe('useMediaPicker', () => {
  it('throws when called outside a MediaPickerContext.Provider', () => {
    expect(() => renderHook(() => useMediaPicker())).toThrow(
      /useMediaPicker\(\) called outside a MediaPickerContext\.Provider/,
    );
  });

  it('returns the port supplied by the nearest Provider', () => {
    const port = { pick: vi.fn() };
    function wrapper({ children }: { children: ReactNode }) {
      return (
        <MediaPickerContext.Provider value={port}>
          {children}
        </MediaPickerContext.Provider>
      );
    }

    const { result } = renderHook(() => useMediaPicker(), { wrapper });

    expect(result.current).toBe(port);
  });
});
