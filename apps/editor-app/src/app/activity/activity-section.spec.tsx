import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AUDIT_ACTIONS } from '@kometio/shared-types';
import type { ActivityEntry } from '@kometio/api-contracts';
import { TooltipProvider } from '../../components/ui/tooltip';
import { ActivitySection } from './activity-section';
import { activitySentence } from './activity-sentence';

function entry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: 'entry-1',
    at: '2026-10-14T09:30:00.000Z',
    action: 'login.succeeded',
    actor: { id: 'user-1', email: 'admin@example.com', displayName: 'Lele' },
    targetId: null,
    targetLabel: null,
    detail: null,
    ...overrides,
  };
}

function renderSection(items: ActivityEntry[], total = items.length, page = 1) {
  const onPageChange = vi.fn();
  render(
    <TooltipProvider>
      <ActivitySection
        items={items}
        page={page}
        total={total}
        onPageChange={onPageChange}
      />
    </TooltipProvider>,
  );
  return { onPageChange };
}

describe('ActivitySection', () => {
  it('says what was done, to what, and by whom', () => {
    renderSection([
      entry({
        action: 'user.invited',
        targetLabel: 'nuova@example.com',
        detail: { role: 'publisher' },
      }),
    ]);

    expect(
      screen.getByText('Ha invitato nuova@example.com come Publisher'),
    ).toBeTruthy();
    expect(screen.getByText('da Lele')).toBeTruthy();
  });

  it('names the person by their address when they have no name', () => {
    renderSection([
      entry({
        actor: { id: 'user-1', email: 'admin@example.com', displayName: null },
      }),
    ]);

    expect(screen.getByText('da admin@example.com')).toBeTruthy();
  });

  it('says when the account that did it has been removed', () => {
    renderSection([entry({ action: 'user.invited', actor: null })]);

    expect(screen.getByText('da un account che è stato rimosso')).toBeTruthy();
  });

  it('names the account a refused sign-in was tried on, and does not say it did it', () => {
    renderSection([
      entry({
        action: 'login.failed',
        detail: { reason: 'wrong-password' },
      }),
    ]);

    expect(
      screen.getByText('Accesso rifiutato per Lele (password sbagliata)'),
    ).toBeTruthy();
    expect(screen.queryByText('da Lele')).toBeNull();
  });

  it('says in words which part of the settings, and why a sign-in was refused', () => {
    renderSection([
      entry({
        id: 'a',
        action: 'site.settings_changed',
        detail: { section: 'cookie-banner' },
      }),
      entry({
        id: 'b',
        action: 'login.failed',
        detail: { reason: 'wrong-password' },
      }),
    ]);

    expect(
      screen.getByText(
        'Ha cambiato le impostazioni del sito: banner dei cookie',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('Accesso rifiutato per Lele (password sbagliata)'),
    ).toBeTruthy();
  });

  it('says how long it keeps what it shows, and that it has nothing when it has nothing', () => {
    renderSection([]);

    expect(screen.getByText(/Conservato per 90 giorni/)).toBeTruthy();
    expect(screen.getByText(/Non è ancora successo niente/)).toBeTruthy();
  });

  it('pages, 25 to a page', () => {
    const { onPageChange } = renderSection([entry()], 60, 1);

    expect(screen.getByText(/Pagina 1 di 3/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /successiva|avanti/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('draws every entry as one item of a list, with its time', () => {
    renderSection([entry({ id: 'a' }), entry({ id: 'b' })]);

    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('activitySentence', () => {
  it('has a sentence for every action there is', () => {
    for (const action of AUDIT_ACTIONS) {
      expect(activitySentence(entry({ action })).key).toBe(
        `activity.actions.${action}`,
      );
    }
  });
});
