import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveBar, type SaveBarProps } from './save-bar';

/** What the router says about a navigation it is holding. */
type BlockerState =
  | { status: 'idle' }
  | { status: 'blocked'; proceed: () => void; reset: () => void };

const { proceed, reset, blocker } = vi.hoisted(() => {
  const state: { current: BlockerState } = { current: { status: 'idle' } };
  return { proceed: vi.fn(), reset: vi.fn(), blocker: state };
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useBlocker: () => blocker.current };
});

function renderBar(props: Partial<SaveBarProps> = {}) {
  return render(
    <SaveBar
      isDirty
      isSaving={false}
      onCancel={vi.fn()}
      onSave={vi.fn()}
      {...props}
    />,
  );
}

describe('SaveBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    blocker.current = { status: 'idle' };
  });

  it('is not on screen while there is nothing to save', () => {
    renderBar({ isDirty: false });

    expect(screen.queryByText('Modifiche non salvate')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Salva' })).toBeNull();
  });

  it('says what it is, in words, and offers Cancel and Save once something changed', () => {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    renderBar({ onCancel, onSave });

    expect(screen.getByText('Modifiche non salvate')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("is the form's own submit button when it is given no handler of its own", () => {
    renderBar({ onSave: undefined });

    expect(
      screen.getByRole('button', { name: 'Salva' }).getAttribute('type'),
    ).toBe('submit');
  });

  it('holds both buttons while it saves, and says so', () => {
    renderBar({ isSaving: true });

    expect(
      screen.getByRole('button', { name: 'Salvataggio in corso...' }),
    ).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Annulla' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('keeps Save waiting, and the bar on screen, while the form cannot be sent', () => {
    renderBar({ canSave: false });

    expect(screen.getByRole('button', { name: 'Salva' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByText('Modifiche non salvate')).toBeTruthy();
  });

  describe('leaving with something unsaved', () => {
    it('asks the browser before the tab is closed', () => {
      renderBar();

      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });

    it('does not ask when nothing changed', () => {
      renderBar({ isDirty: false });

      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    it('asks in the editor’s own dialog before a link inside the app, and leaves when told to', () => {
      blocker.current = { status: 'blocked', proceed, reset };
      renderBar();

      expect(screen.getByText('Uscire senza salvare?')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Esci' }));

      expect(proceed).toHaveBeenCalledTimes(1);
    });

    it('stays where it is when the answer is no', () => {
      blocker.current = { status: 'blocked', proceed, reset };
      renderBar();

      // The dialog's own Cancel, not the bar's.
      fireEvent.click(
        within(screen.getByRole('alertdialog')).getByRole('button', {
          name: 'Annulla',
        }),
      );

      expect(reset).toHaveBeenCalledTimes(1);
      expect(proceed).not.toHaveBeenCalled();
    });
  });
});
