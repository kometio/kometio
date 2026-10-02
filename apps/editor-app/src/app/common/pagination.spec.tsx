import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../components/ui/tooltip';
import { Pagination } from './pagination';

function renderPagination(page: number, totalPages: number) {
  const onPageChange = vi.fn();
  const view = render(
    <TooltipProvider>
      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
      />
    </TooltipProvider>,
  );
  return { onPageChange, ...view };
}

describe('Pagination', () => {
  it('says where you are and goes to the next and the previous page', () => {
    const { onPageChange } = renderPagination(2, 5);

    expect(screen.getByText('Pagina 2 di 5')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pagina successiva' }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByRole('button', { name: 'Pagina precedente' }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });

  it('cannot go before the first page or past the last', () => {
    const first = renderPagination(1, 3);
    expect(
      screen
        .getByRole('button', { name: 'Pagina precedente' })
        .hasAttribute('disabled'),
    ).toBe(true);
    first.unmount();

    renderPagination(3, 3);
    expect(
      screen
        .getByRole('button', { name: 'Pagina successiva' })
        .hasAttribute('disabled'),
    ).toBe(true);
  });

  it('draws nothing for a list that fits on one page', () => {
    const { container } = renderPagination(1, 1);

    expect(container.textContent).toBe('');
  });
});
