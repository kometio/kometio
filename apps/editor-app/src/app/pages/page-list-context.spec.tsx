import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { PageListContext, usePageList } from './page-list-context';

describe('usePageList', () => {
  it('throws when called outside a PageListContext.Provider', () => {
    expect(() => renderHook(() => usePageList())).toThrow(
      /usePageList\(\) called outside a PageListContext\.Provider/,
    );
  });

  it('returns the port supplied by the nearest Provider', () => {
    const port = { pick: vi.fn() };
    function wrapper({ children }: { children: ReactNode }) {
      return (
        <PageListContext.Provider value={port}>
          {children}
        </PageListContext.Provider>
      );
    }

    const { result } = renderHook(() => usePageList(), { wrapper });

    expect(result.current).toBe(port);
  });
});
