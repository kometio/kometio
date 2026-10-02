import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmActionDialog } from './confirm-action-dialog';

describe('ConfirmActionDialog', () => {
  it('shows the given title and description', () => {
    render(
      <ConfirmActionDialog
        open
        onOpenChange={vi.fn()}
        title="Eliminare questa pagina?"
        description='"Chi siamo" verrà eliminata definitivamente.'
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText('Eliminare questa pagina?')).toBeTruthy();
    expect(screen.getByText(/"Chi siamo"/)).toBeTruthy();
  });

  it('defaults the action label to "Elimina", for the destructive case every existing caller relies on', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmActionDialog
        open
        onOpenChange={vi.fn()}
        title="Eliminare questo file?"
        description="Verrà eliminato definitivamente."
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^elimina$/i }));

    expect(onConfirm).toHaveBeenCalled();
  });

  it('uses a caller-supplied actionLabel for a non-delete confirmation (e.g. diverge)', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmActionDialog
        open
        onOpenChange={vi.fn()}
        title="Scollegare questa lingua?"
        description="Non riceverà più le modifiche strutturali."
        onConfirm={onConfirm}
        actionLabel="Scollega"
        actionVariant="default"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^scollega$/i }));

    expect(onConfirm).toHaveBeenCalled();
  });

  it('does not call onConfirm when cancelled', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmActionDialog
        open
        onOpenChange={vi.fn()}
        title="Eliminare questo modulo?"
        description="Verrà eliminato definitivamente."
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /annulla/i }));

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
