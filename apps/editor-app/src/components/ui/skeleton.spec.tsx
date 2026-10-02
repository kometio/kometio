import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SkeletonFields, SkeletonRows } from './skeleton';

describe('SkeletonFields', () => {
  it('draws one label and one field per field, and says it is loading', () => {
    const { container } = render(<SkeletonFields fields={2} />);

    expect(screen.getByRole('status').textContent).toBe('Caricamento...');
    // Two shapes per field: its label and its box.
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      4,
    );
  });

  it('says what the view says it is loading, when it says more', () => {
    render(<SkeletonFields label="Caricamento degli stili" />);

    expect(screen.getByRole('status').textContent).toBe(
      'Caricamento degli stili',
    );
  });
});

describe('SkeletonRows', () => {
  // A pulse is motion: nobody who asked the system for less gets it.
  it('pulses only where motion is welcome', () => {
    const { container } = render(<SkeletonRows rows={3} />);
    const shapes = container.querySelectorAll('[data-slot="skeleton"]');

    expect(shapes).toHaveLength(3);
    for (const shape of shapes) {
      expect(shape.className).toContain('motion-safe:animate-pulse');
      expect(shape.getAttribute('aria-hidden')).toBe('true');
    }
  });
});
