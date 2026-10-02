import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CALENDAR_LOAD_TIMEOUT_MS,
  dayButton,
  openCalendar,
  preloadCalendar,
} from '../../../test/date-picker.test-fixture';
import { DateField, TimeField } from './date-time-fields';

describe('DateField', () => {
  beforeAll(preloadCalendar, CALENDAR_LOAD_TIMEOUT_MS);

  it('shows a stored date and writes back the ISO day that was picked', async () => {
    const onChange = vi.fn();
    render(<DateField label="Data" value="2026-09-13" onChange={onChange} />);
    const field = screen.getByRole('button', { name: 'Data' });

    expect(field.textContent).toContain('13 set 2026');

    await openCalendar(field);
    fireEvent.click(dayButton('1'));
    expect(onChange).toHaveBeenCalledWith('2026-09-01');
  });

  it('treats anything that is not a string as no date, rather than crashing on it', () => {
    render(<DateField label="Data" value={null} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Data' }).textContent).toContain(
      'Nessuna data',
    );
  });

  it('writes the empty string when cleared', () => {
    const onChange = vi.fn();
    render(<DateField label="Data" value="2026-09-13" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancella data' }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});

describe('TimeField', () => {
  it('shows a stored time and writes back HH:MM', () => {
    const onChange = vi.fn();
    const { container } = render(
      <TimeField value="20:30" onChange={onChange} />,
    );
    const input = container.querySelector('input');
    if (!input) throw new Error('TimeField rendered no input');

    expect(input.type).toBe('time');
    expect(input.value).toBe('20:30');

    fireEvent.change(input, { target: { value: '21:00' } });
    expect(onChange).toHaveBeenCalledWith('21:00');
  });
});
