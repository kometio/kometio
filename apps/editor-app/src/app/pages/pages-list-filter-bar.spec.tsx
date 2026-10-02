import type { ReactNode } from 'react';
import {
  CALENDAR_LOAD_TIMEOUT_MS,
  dayButton,
  openCalendar,
  preloadCalendar,
} from '../../test/date-picker.test-fixture';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import * as usersApi from '../../lib/users-api-client';
import { chooseOption } from '../../test/select.test-fixture';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { buildUserRecord } from '@kometio/testing/records';
import {
  EMPTY_PAGES_LIST_FILTERS,
  PagesListFilterBar,
  type PagesListFilterValues,
} from './pages-list-filter-bar';

vi.mock('../../lib/users-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/users-api-client')>();
  return { ...actual, listUsers: vi.fn() };
});

function renderBar(
  value: PagesListFilterValues = EMPTY_PAGES_LIST_FILTERS,
  onChange = vi.fn(),
) {
  vi.mocked(usersApi.listUsers).mockResolvedValue({
    items: [
      buildUserRecord({
        email: 'ada@example.test',
        displayName: 'Ada Lovelace',
      }),
    ],
    total: 1,
  });
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={createTestQueryClient()}>
        {children}
      </QueryClientProvider>
    );
  }
  return {
    onChange,
    ...render(
      <PagesListFilterBar
        value={value}
        onChange={onChange}
        enabledLocales={['it', 'en']}
      />,
      { wrapper },
    ),
  };
}

describe('PagesListFilterBar', () => {
  beforeAll(preloadCalendar, CALENDAR_LOAD_TIMEOUT_MS);

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls onChange with the updated search text, keeping other filters unchanged', () => {
    const { onChange } = renderBar({
      ...EMPTY_PAGES_LIST_FILTERS,
      locale: 'it',
    });

    fireEvent.change(screen.getByLabelText('Cerca per titolo'), {
      target: { value: 'chi siamo' },
    });

    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_PAGES_LIST_FILTERS,
      locale: 'it',
      search: 'chi siamo',
    });
  });

  it('calls onChange with the updated date range', async () => {
    const { onChange } = renderBar();

    // The four secondary filters sit behind a button now: they were always
    // on screen and took two full rows at 1024px, above a list that had not
    // started yet.
    fireEvent.click(screen.getByRole('button', { name: /^filtri/i }));
    // The calendar opens on the current month when nothing is chosen yet.
    await openCalendar(screen.getByLabelText('Da'));
    fireEvent.click(dayButton('1'));

    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_PAGES_LIST_FILTERS,
      createdAfter: `${today.getFullYear()}-${month}-01`,
    });
  });

  it('filters by state, and offers each state by its name', () => {
    const { onChange } = renderBar();

    fireEvent.click(screen.getByRole('button', { name: /^filtri/i }));
    chooseOption(screen.getByLabelText('Stato'), 'Bozza');

    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_PAGES_LIST_FILTERS,
      status: 'draft',
    });
  });

  it('does not show the clear button when no filter is active', () => {
    renderBar();

    expect(screen.queryByRole('button', { name: 'Rimuovi filtri' })).toBeNull();
  });

  /*
   * A button that hides four controls has to say how many of them are
   * doing something, or a short list has no visible explanation.
   */
  it('counts the hidden filters that are active, and starts open when any is', () => {
    renderBar({
      ...EMPTY_PAGES_LIST_FILTERS,
      createdBy: 'user-1',
      locale: 'en',
    });

    expect(
      screen.getByRole('button', { name: /^filtri/i }).textContent,
    ).toContain('2');
    expect(screen.getByLabelText('Da')).toBeTruthy();
  });

  it('shows the clear button once a filter is active, and resets everything on click', () => {
    const { onChange } = renderBar({
      ...EMPTY_PAGES_LIST_FILTERS,
      search: 'chi siamo',
    });

    const clearButton = screen.getByRole('button', { name: 'Rimuovi filtri' });
    fireEvent.click(clearButton);

    expect(onChange).toHaveBeenCalledWith(EMPTY_PAGES_LIST_FILTERS);
  });
});
