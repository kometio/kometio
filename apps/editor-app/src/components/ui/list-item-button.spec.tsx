import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListItemButton } from './list-item-button';

describe('ListItemButton', () => {
  it('is a plain button, so it never submits the form it sits in', () => {
    render(<ListItemButton>Home</ListItemButton>);

    expect(
      screen.getByRole('button', { name: 'Home' }).getAttribute('type'),
    ).toBe('button');
  });

  it('draws where you are and what is chosen from the ARIA state itself', () => {
    render(
      <>
        <ListItemButton aria-current="true">Qui</ListItemButton>
        <ListItemButton aria-pressed>Scelto</ListItemButton>
      </>,
    );

    // The fill is keyed on the attribute, so a row cannot look chosen
    // while a screen reader is told it is not, or the other way round.
    expect(screen.getByRole('button', { name: 'Qui' }).className).toContain(
      'aria-[current=true]:bg-muted',
    );
    expect(screen.getByRole('button', { name: 'Scelto' }).className).toContain(
      'aria-pressed:bg-muted',
    );
  });

  it('leaves the fills to the container when it draws no frame', () => {
    render(
      <ListItemButton inset="none" aria-pressed>
        Riga
      </ListItemButton>,
    );

    expect(
      screen.getByRole('button', { name: 'Riga' }).className,
    ).not.toContain('bg-muted');
  });
});
