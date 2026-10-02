import { renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import {
  rememberGenerationPrompt,
  usePendingGenerationPrompt,
} from './pending-page-generation';

describe('usePendingGenerationPrompt', () => {
  it('hands the prompt to the page it was created for, once', () => {
    const client = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    rememberGenerationPrompt(client, 'group-1', 'Chi siamo');

    const other = renderHook(() => usePendingGenerationPrompt('group-2'), {
      wrapper,
    });
    expect(other.result.current).toBeUndefined();

    const first = renderHook(() => usePendingGenerationPrompt('group-1'), {
      wrapper,
    });
    expect(first.result.current).toBe('Chi siamo');
    // Kept for as long as the editor that received it is open…
    first.rerender();
    expect(first.result.current).toBe('Chi siamo');
    first.unmount();

    // …and not given again: opening the page later does not rewrite it.
    const again = renderHook(() => usePendingGenerationPrompt('group-1'), {
      wrapper,
    });
    expect(again.result.current).toBeUndefined();
  });
});
