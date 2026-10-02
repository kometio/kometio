import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CALENDAR_LOAD_TIMEOUT_MS,
  dayButton,
  openCalendar,
  preloadCalendar,
} from '../../test/date-picker.test-fixture';
import { DatePicker } from './date-picker';

describe('DatePicker', () => {
  beforeAll(preloadCalendar, CALENDAR_LOAD_TIMEOUT_MS);

  it('shows the stored day in the editor language, not the stored spelling', () => {
    render(
      <DatePicker aria-label="Data" value="2026-09-13" onChange={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Data' }).textContent).toContain(
      '13 set 2026',
    );
  });

  it('says there is no date when there is none', () => {
    render(<DatePicker aria-label="Data" value="" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Data' }).textContent).toContain(
      'Nessuna data',
    );
  });

  /*
   * The first and the last day of a month are where reading "2026-10-01"
   * as UTC midnight would land on the 30th of September west of Greenwich;
   * the value goes through the date's local parts both ways.
   */
  it.each([
    ['1', '2026-10-01'],
    ['31', '2026-10-31'],
  ])('writes day %s back as %s', async (day, expected) => {
    const onChange = vi.fn();
    render(
      <DatePicker aria-label="Data" value="2026-10-15" onChange={onChange} />,
    );

    await openCalendar(screen.getByRole('button', { name: 'Data' }));
    fireEvent.click(dayButton(day));

    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it('clears to the empty string, which every block reads as no date', () => {
    const onChange = vi.fn();
    render(
      <DatePicker aria-label="Data" value="2026-10-15" onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancella data' }));

    expect(onChange).toHaveBeenCalledWith('');
  });
});
