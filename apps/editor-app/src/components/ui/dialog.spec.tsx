import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from './dialog';

describe('DialogContent', () => {
  /*
   * The close button is announced by its hidden label. It was a literal
   * "Close" on every dialog of an Italian interface, so a screen reader
   * read one English word in the middle of everything else.
   */
  it('names its close button in the language of the editor', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Titolo</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole('button', { name: 'Chiudi' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });
});
