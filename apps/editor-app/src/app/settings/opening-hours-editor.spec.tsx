import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OpeningHoursDay } from '@kometio/shared-types';
import { TooltipProvider } from '../../components/ui/tooltip';
import { OpeningHoursEditor } from './opening-hours-editor';

const emptyWeek: OpeningHoursDay[] = [
  { dayOfWeek: 'monday', ranges: [] },
  { dayOfWeek: 'tuesday', ranges: [] },
  { dayOfWeek: 'wednesday', ranges: [] },
  { dayOfWeek: 'thursday', ranges: [] },
  { dayOfWeek: 'friday', ranges: [] },
  { dayOfWeek: 'saturday', ranges: [] },
  { dayOfWeek: 'sunday', ranges: [] },
];

function renderEditor(
  value: OpeningHoursDay[] = emptyWeek,
  onChange: (value: OpeningHoursDay[]) => void = vi.fn(),
) {
  return render(
    <TooltipProvider>
      <OpeningHoursEditor value={value} onChange={onChange} />
    </TooltipProvider>,
  );
}

describe('OpeningHoursEditor', () => {
  it('shows all 7 days, closed by default', () => {
    renderEditor();

    expect(screen.getByText('Lunedì')).toBeTruthy();
    expect(screen.getByText('Domenica')).toBeTruthy();
    expect(screen.getAllByText('Chiuso')).toHaveLength(7);
  });

  it('adds a default range to a day', () => {
    const onChange = vi.fn();
    renderEditor(emptyWeek, onChange);

    const [firstAddButton] = screen.getAllByText('Aggiungi fascia');
    fireEvent.click(firstAddButton);

    expect(onChange).toHaveBeenCalledWith([
      { dayOfWeek: 'monday', ranges: [{ opens: '09:00', closes: '18:00' }] },
      ...emptyWeek.slice(1),
    ]);
  });

  it('supports a second range on the same day, e.g. a lunch closure', () => {
    const onChange = vi.fn();
    const withOneRange = [
      {
        dayOfWeek: 'monday' as const,
        ranges: [{ opens: '09:00', closes: '13:00' }],
      },
      ...emptyWeek.slice(1),
    ];
    renderEditor(withOneRange, onChange);

    const [firstAddButton] = screen.getAllByText('Aggiungi fascia');
    fireEvent.click(firstAddButton);

    expect(onChange).toHaveBeenCalledWith([
      {
        dayOfWeek: 'monday',
        ranges: [
          { opens: '09:00', closes: '13:00' },
          { opens: '09:00', closes: '18:00' },
        ],
      },
      ...emptyWeek.slice(1),
    ]);
  });

  it('changes the opens/closes time of a range', () => {
    const onChange = vi.fn();
    const withOneRange = [
      {
        dayOfWeek: 'monday' as const,
        ranges: [{ opens: '09:00', closes: '18:00' }],
      },
      ...emptyWeek.slice(1),
    ];
    renderEditor(withOneRange, onChange);

    const timeInputs = screen.getAllByDisplayValue('09:00');
    fireEvent.change(timeInputs[0], { target: { value: '10:00' } });

    expect(onChange).toHaveBeenCalledWith([
      {
        dayOfWeek: 'monday',
        ranges: [{ opens: '10:00', closes: '18:00' }],
      },
      ...emptyWeek.slice(1),
    ]);
  });

  it('removes a range', () => {
    const onChange = vi.fn();
    const withOneRange = [
      {
        dayOfWeek: 'monday' as const,
        ranges: [{ opens: '09:00', closes: '18:00' }],
      },
      ...emptyWeek.slice(1),
    ];
    renderEditor(withOneRange, onChange);

    fireEvent.click(screen.getByRole('button', { name: /rimuovi fascia/i }));

    expect(onChange).toHaveBeenCalledWith(emptyWeek);
  });

  it('marks a range that closes when it opens, under its row', () => {
    const week = emptyWeek.map((day) =>
      day.dayOfWeek === 'monday'
        ? { ...day, ranges: [{ opens: '09:00', closes: '09:00' }] }
        : day,
    );
    renderEditor(week);

    const closes = screen.getByLabelText('Chiusura, Lunedì');
    const message = screen.getByText(
      'L’apertura e la chiusura non possono essere alla stessa ora.',
    );
    expect(closes.getAttribute('aria-invalid')).toBe('true');
    expect(closes.getAttribute('aria-describedby')).toBe(message.id);
    // The opening time is not the one at fault.
    expect(
      screen.getByLabelText('Apertura, Lunedì').getAttribute('aria-invalid'),
    ).toBeNull();
  });

  // A bar open until two is not a mistake: schema.org reads a `closes`
  // before `opens` as the next day.
  it('says a range that closes before it opens runs past midnight, and does not mark it', () => {
    const week = emptyWeek.map((day) =>
      day.dayOfWeek === 'friday'
        ? { ...day, ranges: [{ opens: '18:00', closes: '02:00' }] }
        : day,
    );
    renderEditor(week);

    expect(
      screen.getByText(
        'Chiude dopo la mezzanotte: alle 02:00 del giorno dopo.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Chiusura, Venerdì').getAttribute('aria-invalid'),
    ).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('copies Monday to Tuesday–Friday', () => {
    const onChange = vi.fn();
    const week = emptyWeek.map((day) =>
      day.dayOfWeek === 'monday'
        ? { ...day, ranges: [{ opens: '09:00', closes: '18:00' }] }
        : day,
    );
    renderEditor(week, onChange);

    fireEvent.click(
      screen.getByRole('button', { name: 'Copia lunedì su martedì–venerdì' }),
    );

    const sent: OpeningHoursDay[] = onChange.mock.calls[0][0];
    expect(sent.map((day) => day.ranges.length)).toEqual([1, 1, 1, 1, 1, 0, 0]);
  });

  it('offers no copy while Monday is closed — there is nothing to copy', () => {
    renderEditor();

    expect(screen.queryByRole('button', { name: /copia lunedì/i })).toBeNull();
  });

  it('writes the word on the remove button, and names the day for a screen reader', () => {
    const week = emptyWeek.map((day) =>
      day.dayOfWeek === 'monday'
        ? { ...day, ranges: [{ opens: '09:00', closes: '18:00' }] }
        : day,
    );
    renderEditor(week);

    expect(
      screen.getByRole('button', { name: 'Rimuovi fascia, Lunedì' })
        .textContent,
    ).toBe('Rimuovi');
  });
});
