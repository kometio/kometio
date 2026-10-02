import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSidebarCollapsed } from './use-sidebar-collapsed';

describe('useSidebarCollapsed', () => {
  beforeEach(() => {
    localStorage.removeItem('kometio-sidebar-collapsed');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts expanded: the words are what make it readable the first time', () => {
    const { result } = renderHook(() => useSidebarCollapsed());

    expect(result.current.isCollapsed).toBe(false);
  });

  it('remembers a fold between visits', () => {
    const first = renderHook(() => useSidebarCollapsed());
    act(() => first.result.current.setCollapsed(true));
    first.unmount();

    const second = renderHook(() => useSidebarCollapsed());

    expect(second.result.current.isCollapsed).toBe(true);
    expect(localStorage.getItem('kometio-sidebar-collapsed')).toBe('true');
  });

  it('remembers an unfold too, rather than folding again next time', () => {
    localStorage.setItem('kometio-sidebar-collapsed', 'true');
    const first = renderHook(() => useSidebarCollapsed());
    act(() => first.result.current.setCollapsed(false));
    first.unmount();

    expect(
      renderHook(() => useSidebarCollapsed()).result.current.isCollapsed,
    ).toBe(false);
  });

  it('still works when the browser refuses to remember anything', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current.isCollapsed).toBe(false);

    act(() => result.current.setCollapsed(true));

    expect(result.current.isCollapsed).toBe(true);
  });
});
