import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TableDataField } from './table-data-field';

describe('TableDataField', () => {
  it('renders one input per cell, with header-row placeholders on the first row', () => {
    render(
      <TableDataField
        value={[
          ['Nome', 'Ruolo'],
          ['Anna', 'Designer'],
        ]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByPlaceholderText('Colonna 1')).toBeTruthy();
    expect(screen.getByPlaceholderText('Colonna 2')).toBeTruthy();
    expect(screen.getAllByRole('textbox')).toHaveLength(4);
  });

  it('updates only the edited cell, leaving the rest of the grid untouched', () => {
    const onChange = vi.fn();
    render(
      <TableDataField
        value={[
          ['Nome', 'Ruolo'],
          ['Anna', 'Designer'],
        ]}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByDisplayValue('Anna'), {
      target: { value: 'Bruno' },
    });

    expect(onChange).toHaveBeenCalledWith([
      ['Nome', 'Ruolo'],
      ['Bruno', 'Designer'],
    ]);
  });

  it('appends a new row matching the current column count', () => {
    const onChange = vi.fn();
    render(<TableDataField value={[['Nome', 'Ruolo']]} onChange={onChange} />);

    fireEvent.click(screen.getByText('Aggiungi riga'));

    expect(onChange).toHaveBeenCalledWith([
      ['Nome', 'Ruolo'],
      ['', ''],
    ]);
  });

  it('removes only the targeted row', () => {
    const onChange = vi.fn();
    render(
      <TableDataField
        value={[['Nome'], ['Anna'], ['Bruno']]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getAllByText('Rimuovi riga')[1]);

    expect(onChange).toHaveBeenCalledWith([['Nome'], ['Bruno']]);
  });

  it('disables removing the last remaining row', () => {
    render(<TableDataField value={[['Nome']]} onChange={vi.fn()} />);

    expect(screen.getByText('Rimuovi riga').closest('button')).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('appends an empty column to every row', () => {
    const onChange = vi.fn();
    render(
      <TableDataField
        value={[
          ['Nome', 'Ruolo'],
          ['Anna', 'Designer'],
        ]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByText('Aggiungi colonna'));

    expect(onChange).toHaveBeenCalledWith([
      ['Nome', 'Ruolo', ''],
      ['Anna', 'Designer', ''],
    ]);
  });

  it('removes the last column from every row', () => {
    const onChange = vi.fn();
    render(
      <TableDataField
        value={[
          ['Nome', 'Ruolo'],
          ['Anna', 'Designer'],
        ]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByText('Rimuovi ultima colonna'));

    expect(onChange).toHaveBeenCalledWith([['Nome'], ['Anna']]);
  });

  it('disables removing the last remaining column', () => {
    render(<TableDataField value={[['Nome']]} onChange={vi.fn()} />);

    expect(
      screen.getByText('Rimuovi ultima colonna').closest('button'),
    ).toHaveProperty('disabled', true);
  });
});
