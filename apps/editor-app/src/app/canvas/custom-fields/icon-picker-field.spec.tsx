import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import * as themeApi from '../../../lib/theme-api-client';
import { createTestQueryClient } from '../../../test/query-client.test-fixture';
import {
  IconListContext,
  type IconListPort,
} from '../../style/icon-list-context';
import { IconField, IconPickerField } from './icon-picker-field';

vi.mock('../../style/use-active-theme-name', () => ({
  useActiveThemeName: () => 'classic',
}));

vi.mock('../../../lib/theme-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../lib/theme-api-client')>();
  return { ...actual, fetchThemeIcons: vi.fn() };
});

/** A port that does nothing, with only what a test cares about given. */
function wrapperWith(overrides: Partial<IconListPort> = {}) {
  const port: IconListPort = {
    pick: vi.fn(),
    resolve: vi.fn(),
    isMissingFromTheme: () => false,
    ...overrides,
  };
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={createTestQueryClient()}>
        <IconListContext.Provider value={port}>
          {children}
        </IconListContext.Provider>
      </QueryClientProvider>
    );
  };
}

describe('IconPickerField', () => {
  it('shows "Scegli icona" and no preview when value is null', () => {
    render(<IconPickerField value={null} onChange={vi.fn()} />, {
      wrapper: wrapperWith(),
    });

    expect(screen.getByText('Scegli icona')).toBeTruthy();
  });

  it('resolves and shows the SVG preview and "Cambia icona" when a value is set', () => {
    const resolve = vi.fn().mockReturnValue('<svg data-testid="icon-svg" />');
    render(<IconPickerField value="arrow-right" onChange={vi.fn()} />, {
      wrapper: wrapperWith({ resolve }),
    });

    expect(resolve).toHaveBeenCalledWith('arrow-right');
    expect(screen.getByText('Cambia icona')).toBeTruthy();
    expect(screen.getByTestId('icon-svg')).toBeTruthy();
  });

  /*
   * The provider preloads the interface icons only, so a logo chosen
   * yesterday had no preview today. It is now fetched on its own — that
   * one logo, not the 5.2MB set it belongs to.
   */
  it('previews a logo by fetching that logo alone', async () => {
    vi.mocked(themeApi.fetchThemeIcons).mockResolvedValue([
      { name: 'brand:github', svg: '<svg data-testid="brand-svg" />' },
    ]);
    const resolve = vi.fn();
    render(<IconPickerField value="brand:github" onChange={vi.fn()} />, {
      wrapper: wrapperWith({ resolve }),
    });

    expect(await screen.findByTestId('brand-svg')).toBeTruthy();
    expect(themeApi.fetchThemeIcons).toHaveBeenCalledWith('classic', 'brand', {
      names: ['brand:github'],
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('calls onChange with the picked icon name when the port resolves one', async () => {
    const onChange = vi.fn();
    const pick = vi.fn().mockResolvedValue('arrow-right');
    render(<IconPickerField value={null} onChange={onChange} />, {
      wrapper: wrapperWith({ pick }),
    });

    fireEvent.click(screen.getByText('Scegli icona'));
    await Promise.resolve();
    await Promise.resolve();

    expect(onChange).toHaveBeenCalledWith('arrow-right');
  });

  it('does not call onChange when the picker is dismissed without a selection', async () => {
    const onChange = vi.fn();
    const pick = vi.fn().mockResolvedValue(null);
    render(<IconPickerField value={null} onChange={onChange} />, {
      wrapper: wrapperWith({ pick }),
    });

    fireEvent.click(screen.getByText('Scegli icona'));
    await Promise.resolve();
    await Promise.resolve();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('says the theme has no such icon, so the site shows nothing for it', () => {
    const isMissingFromTheme = vi.fn().mockReturnValue(true);
    render(<IconPickerField value="palette" onChange={vi.fn()} />, {
      wrapper: wrapperWith({ isMissingFromTheme }),
    });

    expect(isMissingFromTheme).toHaveBeenCalledWith('palette');
    expect(
      screen.getByText(
        "Il tema non ha l'icona «palette»: sul sito non si vede. Scegline un'altra.",
      ),
    ).toBeTruthy();
    // Still changeable and removable: the warning is the way out, not a wall.
    expect(screen.getByRole('button', { name: 'Cambia icona' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rimuovi icona' })).toBeTruthy();
  });

  it('says nothing about an icon the theme has, or about no icon at all', () => {
    const { rerender } = render(
      <IconPickerField value="palette" onChange={vi.fn()} />,
      { wrapper: wrapperWith() },
    );
    expect(screen.queryByText(/Il tema non ha/)).toBeNull();

    rerender(<IconPickerField value={null} onChange={vi.fn()} />);
    expect(screen.queryByText(/Il tema non ha/)).toBeNull();
  });

  /*
   * A NavLink saved before it had an icon field holds no `icon` key: the
   * inspector hands the field `undefined`, which the name-only checks
   * used to crash on (`startsWith` of undefined).
   */
  it('treats a missing or empty prop as no icon', () => {
    const isMissingFromTheme = vi.fn().mockReturnValue(true);
    const { rerender } = render(
      <IconField value={undefined} onChange={vi.fn()} />,
      { wrapper: wrapperWith({ isMissingFromTheme }) },
    );
    expect(screen.getByText('Scegli icona')).toBeTruthy();

    rerender(<IconField value="" onChange={vi.fn()} />);
    expect(screen.getByText('Scegli icona')).toBeTruthy();
    expect(isMissingFromTheme).not.toHaveBeenCalled();
  });

  it('calls onChange with null when the remove button is clicked', () => {
    const onChange = vi.fn();
    render(<IconPickerField value="arrow-right" onChange={onChange} />, {
      wrapper: wrapperWith(),
    });

    // By accessible name, not by `title`: the button is labelled through
    // i18n now, and a screen reader finds it the same way this does.
    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi icona' }));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
