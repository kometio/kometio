import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writePanelCollapsed } from './side-panel-preferences';
import { useSidePanel } from './use-side-panel';

function windowIs(narrow: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: narrow && query === '(max-width: 767px)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe('useSidePanel', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  /*
   * At a phone's width the two panels and the canvas cannot sit side by
   * side: the editor scrolled sideways by 124px at 390.
   */
  it('starts closed on a narrow window when nothing was chosen yet', () => {
    windowIs(true);

    const { result } = renderHook(() => useSidePanel('inspector'));

    expect(result.current.isCollapsed).toBe(true);
  });

  it('starts open on a wide window when nothing was chosen yet', () => {
    windowIs(false);

    const { result } = renderHook(() => useSidePanel('inspector'));

    expect(result.current.isCollapsed).toBe(false);
  });

  it('keeps what somebody chose, whatever the width', () => {
    windowIs(true);
    writePanelCollapsed('inspector', false);

    const { result } = renderHook(() => useSidePanel('inspector'));

    expect(result.current.isCollapsed).toBe(false);
  });
});
