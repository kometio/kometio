import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pagesListSearchSchema } from './pages-list-search';
import { usePagesListFilters } from './use-pages-list-filters';

describe('usePagesListFilters', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(url: Record<string, unknown> = {}) {
    const apply = vi.fn();
    const search = pagesListSearchSchema.parse(url);
    const view = renderHook(
      ({ current }) => usePagesListFilters(current, apply),
      { initialProps: { current: search } },
    );
    return { apply, view, search };
  }

  it('starts from the address', () => {
    const { view } = setup({ status: 'draft', search: 'chi' });

    expect(view.result.current.filters).toMatchObject({
      status: 'draft',
      search: 'chi',
    });
    expect(view.result.current.debouncedSearch).toBe('chi');
  });

  it('writes a choice into the address at once', () => {
    const { apply, view } = setup();

    act(() =>
      view.result.current.setFilters({
        ...view.result.current.filters,
        locale: 'en',
      }),
    );

    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'en' }),
    );
  });

  it('holds the search text in the field as it is typed, and writes it once the typing pauses', () => {
    const { apply, view } = setup();

    act(() =>
      view.result.current.setFilters({
        ...view.result.current.filters,
        search: 'ch',
      }),
    );
    act(() =>
      view.result.current.setFilters({
        ...view.result.current.filters,
        search: 'chi',
      }),
    );
    // The field has what was typed; nothing was written yet.
    expect(view.result.current.filters.search).toBe('chi');
    expect(apply).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'chi' }),
    );
    expect(view.result.current.debouncedSearch).toBe('chi');
  });

  it('does not rewrite an address that already says it', () => {
    const { apply, view } = setup({ status: 'draft' });

    act(() =>
      view.result.current.setFilters({
        ...view.result.current.filters,
        status: 'draft',
      }),
    );
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(apply).not.toHaveBeenCalled();
  });

  it('drops a filter from the address when it is cleared', () => {
    const { apply, view } = setup({ locale: 'en' });

    act(() =>
      view.result.current.setFilters({
        ...view.result.current.filters,
        locale: '',
      }),
    );

    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ locale: undefined }),
    );
  });
});
