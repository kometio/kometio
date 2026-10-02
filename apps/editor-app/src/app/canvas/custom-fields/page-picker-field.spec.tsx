import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { PickedPage } from '@kometio/shared-types';
import {
  PageListContext,
  type PageListPort,
} from '../../pages/page-list-context';
import { PagePickerField } from './page-picker-field';

const page: PickedPage = {
  pageGroupId: 'group-1',
  title: 'Chi siamo',
};

function wrapperWith(port: PageListPort) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <PageListContext.Provider value={port}>
        {children}
      </PageListContext.Provider>
    );
  };
}

describe('PagePickerField', () => {
  it('shows "Scegli pagina" and no title when value is null', () => {
    render(<PagePickerField value={null} onChange={vi.fn()} />, {
      wrapper: wrapperWith({ pick: vi.fn() }),
    });

    expect(screen.getByText('Scegli pagina')).toBeTruthy();
    expect(screen.queryByText('Chi siamo')).toBeNull();
  });

  it('shows the picked page title and "Cambia pagina" when a value is set', () => {
    render(<PagePickerField value={page} onChange={vi.fn()} />, {
      wrapper: wrapperWith({ pick: vi.fn() }),
    });

    expect(screen.getByText('Chi siamo')).toBeTruthy();
    expect(screen.getByText('Cambia pagina')).toBeTruthy();
  });

  it('calls onChange with the picked page when the port resolves one', async () => {
    const onChange = vi.fn();
    const pick = vi.fn().mockResolvedValue(page);
    render(<PagePickerField value={null} onChange={onChange} />, {
      wrapper: wrapperWith({ pick }),
    });

    fireEvent.click(screen.getByText('Scegli pagina'));
    await Promise.resolve();
    await Promise.resolve();

    expect(onChange).toHaveBeenCalledWith(page);
  });

  it('does not call onChange when the picker is dismissed without a selection', async () => {
    const onChange = vi.fn();
    const pick = vi.fn().mockResolvedValue(null);
    render(<PagePickerField value={null} onChange={onChange} />, {
      wrapper: wrapperWith({ pick }),
    });

    fireEvent.click(screen.getByText('Scegli pagina'));
    await Promise.resolve();
    await Promise.resolve();

    expect(onChange).not.toHaveBeenCalled();
  });
});
