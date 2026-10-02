import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './checkbox';

describe('Checkbox', () => {
  it('is a checkbox with the name of the label around it, and toggles when the label is clicked', () => {
    const onCheckedChange = vi.fn();
    render(
      <label>
        <Checkbox checked={false} onCheckedChange={onCheckedChange} />
        Ho capito
      </label>,
    );

    const box = screen.getByRole('checkbox', { name: 'Ho capito' });
    expect(box.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByText('Ho capito'));

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('says whether it is ticked', () => {
    render(<Checkbox checked aria-label="Sì" onCheckedChange={vi.fn()} />);

    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('cannot be toggled while it is disabled', () => {
    const onCheckedChange = vi.fn();
    render(
      <Checkbox disabled aria-label="No" onCheckedChange={onCheckedChange} />,
    );

    fireEvent.click(screen.getByRole('checkbox'));

    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
