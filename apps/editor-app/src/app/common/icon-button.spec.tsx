import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Trash2 } from 'lucide-react';
import { TooltipProvider } from '../../components/ui/tooltip';
import { IconButton } from './icon-button';

function renderInForm(button: React.ReactNode) {
  const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
  render(
    <TooltipProvider>
      <form onSubmit={onSubmit}>{button}</form>
    </TooltipProvider>,
  );
  return onSubmit;
}

describe('IconButton', () => {
  it("does not submit the form it sits in: removing a row is not the form's Save", () => {
    const onClick = vi.fn();
    const onSubmit = renderInForm(
      <IconButton label="Rimuovi" onClick={onClick}>
        <Trash2 />
      </IconButton>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi' }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('can still be the form’s submit button, when it says so', () => {
    const onSubmit = renderInForm(
      <IconButton label="Invia" type="submit">
        <Trash2 />
      </IconButton>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Invia' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
