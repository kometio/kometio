import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/http-client';
import { PromptDialog, type PromptDialogProps } from './prompt-dialog';

function renderPrompt(props: Partial<PromptDialogProps> = {}) {
  const onOpenChange = vi.fn();
  const onSubmit = vi.fn<PromptDialogProps['onSubmit']>();
  const view = render(
    <PromptDialog
      open
      onOpenChange={onOpenChange}
      title="Nuova sezione"
      label="Nome"
      submitLabel="Crea"
      busyLabel="Creazione in corso..."
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { ...view, onOpenChange, onSubmit };
}

describe('PromptDialog', () => {
  it('opens on the value it is given', () => {
    renderPrompt({ initialValue: 'https://esempio.test' });

    expect(screen.getByLabelText('Nome')).toHaveProperty(
      'value',
      'https://esempio.test',
    );
  });

  it('hands over the answer trimmed, and closes once it is taken', async () => {
    const { onSubmit, onOpenChange } = renderPrompt();

    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: '  Piè di pagina  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crea' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onSubmit).toHaveBeenCalledWith('Piè di pagina');
  });

  it('stays open with the answer and the reason when it is refused', async () => {
    const onSubmit = vi
      .fn<PromptDialogProps['onSubmit']>()
      .mockRejectedValue(
        new ApiError(400, { message: 'Il nome è troppo lungo.' }),
      );
    const { onOpenChange } = renderPrompt({ onSubmit });

    const field = screen.getByLabelText('Nome');
    fireEvent.change(field, { target: { value: 'Testata' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crea' }));

    const error = await screen.findByRole('alert');
    expect(error.textContent).toBe('Il nome è troppo lungo.');
    expect(field).toHaveProperty('value', 'Testata');
    expect(field.getAttribute('aria-describedby')).toBe(error.id);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('says the refusal in the words it is given for it', async () => {
    renderPrompt({
      onSubmit: () => Promise.reject(new ApiError(409, {})),
      errorMessage: () => 'Esiste già una sezione con questo nome.',
    });

    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'Testata' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crea' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Esiste già una sezione con questo nome.',
    );
  });

  it('cannot be sent empty unless an empty answer means something', () => {
    const { unmount } = renderPrompt();
    expect(screen.getByRole('button', { name: 'Crea' })).toHaveProperty(
      'disabled',
      true,
    );
    unmount();

    renderPrompt({ required: false });
    expect(screen.getByRole('button', { name: 'Crea' })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('starts again from its value each time it opens', () => {
    const { rerender, onOpenChange, onSubmit } = renderPrompt({
      initialValue: 'Prima',
    });
    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'Mai confermato' },
    });

    const props = {
      onOpenChange,
      onSubmit,
      title: 'Nuova sezione',
      label: 'Nome',
      submitLabel: 'Crea',
      initialValue: 'Prima',
    };
    rerender(<PromptDialog open={false} {...props} />);
    rerender(<PromptDialog open {...props} />);

    expect(screen.getByLabelText('Nome')).toHaveProperty('value', 'Prima');
  });
});
