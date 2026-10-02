import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { FormListContext, useFormList } from './form-list-context';

describe('useFormList', () => {
  it('throws when called outside a FormListContext.Provider', () => {
    expect(() => renderHook(() => useFormList())).toThrow(
      /useFormList\(\) called outside a FormListContext\.Provider/,
    );
  });

  it('returns the port supplied by the nearest Provider', () => {
    const port = { pick: vi.fn() };
    function wrapper({ children }: { children: ReactNode }) {
      return (
        <FormListContext.Provider value={port}>
          {children}
        </FormListContext.Provider>
      );
    }

    const { result } = renderHook(() => useFormList(), { wrapper });

    expect(result.current).toBe(port);
  });
});
