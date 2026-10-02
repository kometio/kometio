import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RoutePending } from './route-pending';

describe('RoutePending', () => {
  it('shows a loading message', () => {
    render(<RoutePending />);

    expect(screen.getByText(/caricamento/i)).toBeTruthy();
  });
});
