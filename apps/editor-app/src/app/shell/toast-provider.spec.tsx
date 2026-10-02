import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToast, ToastProvider } from './toast-provider';
import { TooltipProvider } from '../../components/ui/tooltip';

function TriggerButton({
  message,
  variant,
}: {
  message: string;
  variant?: 'default' | 'destructive' | 'success';
}) {
  const { toast } = useToast();
  return (
    <button type="button" onClick={() => toast(message, variant)}>
      Trigger
    </button>
  );
}

function ActionTrigger({ onOpen }: { onOpen: () => void }) {
  const { toast } = useToast();
  return (
    <button
      type="button"
      onClick={() =>
        toast('Pagina duplicata', 'success', {
          label: 'Apri la copia',
          onClick: onOpen,
        })
      }
    >
      Trigger
    </button>
  );
}

function renderWithProvider(
  message: string,
  variant?: 'default' | 'destructive' | 'success',
) {
  return render(
    <ToastProvider>
      <TriggerButton message={message} variant={variant} />
    </ToastProvider>,
    { wrapper: TooltipProvider },
  );
}

describe('ToastProvider / useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a toast with the given message when triggered', () => {
    renderWithProvider('Salvataggio non riuscito');

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    });

    expect(screen.getByText('Salvataggio non riuscito')).not.toBeNull();
  });

  it('announces the toast via a live region, for screen readers', () => {
    renderWithProvider('Errore');

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    });

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Errore');
  });

  it('dismisses the toast when its close button is clicked', () => {
    renderWithProvider('Errore');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    });
    expect(screen.getByText('Errore')).not.toBeNull();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Chiudi notifica' }));
    });

    expect(screen.queryByText('Errore')).toBeNull();
  });

  it('auto-dismisses the toast after its duration elapses', () => {
    renderWithProvider('Errore');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    });
    expect(screen.getByText('Errore')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(screen.queryByText('Errore')).toBeNull();
  });

  it('offers what the result makes possible next, in words, and closes once it is taken', () => {
    const onOpen = vi.fn();
    render(
      <ToastProvider>
        <ActionTrigger onOpen={onOpen} />
      </ToastProvider>,
      { wrapper: TooltipProvider },
    );
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Apri la copia' }));
    });

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Pagina duplicata')).toBeNull();
  });

  it('draws no action when there is none', () => {
    renderWithProvider('Salvato');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    });

    // Only the trigger and the toast's own close button.
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('throws when useToast is called outside a ToastProvider', () => {
    // React logs its own error boundary noise for a thrown render — silenced
    // here, it's expected and asserted on below via the thrown error itself.
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    expect(() => render(<TriggerButton message="x" />)).toThrow(
      'useToast must be used within a ToastProvider',
    );

    consoleError.mockRestore();
  });
});
