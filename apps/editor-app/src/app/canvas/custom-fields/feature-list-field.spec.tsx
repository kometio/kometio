import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FeatureListField } from './feature-list-field';

describe('FeatureListField', () => {
  it('joins the value array into newline-separated textarea content', () => {
    render(
      <FeatureListField value={['Uno', 'Due', 'Tre']} onChange={vi.fn()} />,
    );

    expect(screen.getByRole('textbox')).toHaveProperty(
      'value',
      'Uno\nDue\nTre',
    );
  });

  it('splits the edited textarea content back into an array on change', () => {
    const onChange = vi.fn();
    render(<FeatureListField value={['Uno']} onChange={onChange} />);

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Uno\nDue' },
    });

    expect(onChange).toHaveBeenCalledWith(['Uno', 'Due']);
  });
});
