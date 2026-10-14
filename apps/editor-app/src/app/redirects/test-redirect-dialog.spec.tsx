import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/redirects-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { TestRedirectDialog } from './test-redirect-dialog';

vi.mock('../../lib/redirects-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/redirects-api-client')>();
  return { ...actual, testRedirect: vi.fn() };
});

function renderDialog() {
  const onAddFor = vi.fn();
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TestRedirectDialog
        siteId="site-1"
        onOpenChange={vi.fn()}
        onAddFor={onAddFor}
      />
    </QueryClientProvider>,
  );
  return { onAddFor };
}

async function ask(address: string) {
  fireEvent.change(screen.getByLabelText('Indirizzo'), {
    target: { value: address },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }));
  });
}

describe('TestRedirectDialog', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [
      { outcome: 'page', path: '/it/chi-siamo' },
      'Lì risponde una pagina: /it/chi-siamo. Una pagina ha sempre la precedenza',
    ],
    [
      { outcome: 'moved', location: '/it/nuova' },
      'Lì c’era una pagina, che è stata spostata. I visitatori vengono mandati a /it/nuova.',
    ],
    [
      { outcome: 'redirect', status: 301, location: '/it/x', ruleId: 'r' },
      'I visitatori vengono mandati a /it/x con un reindirizzamento permanente.',
    ],
    [
      { outcome: 'redirect', status: 302, location: '/it/x', ruleId: 'r' },
      'I visitatori vengono mandati a /it/x con un reindirizzamento temporaneo.',
    ],
    [
      { outcome: 'gone', ruleId: 'r' },
      'L’indirizzo è segnato come rimosso: i visitatori ricevono la risposta «410 Gone».',
    ],
    [
      { outcome: 'broken', ruleId: 'r' },
      'Un reindirizzamento corrisponde, ma la pagina a cui porta non è pubblicata',
    ],
    [
      { outcome: 'loop', ruleId: 'r' },
      'I reindirizzamenti mandano i visitatori in tondo. Modificane uno.',
    ],
    [
      { outcome: 'none' },
      'Lì non risponde nulla: i visitatori vedono «non trovato».',
    ],
  ] as const)('says %j in words', async (result, words) => {
    vi.mocked(api.testRedirect).mockResolvedValue(result);
    renderDialog();

    await ask('/some/address');

    expect(
      await screen.findByText(new RegExp(words.slice(0, 40))),
    ).toBeTruthy();
    expect(api.testRedirect).toHaveBeenCalledWith('site-1', '/some/address');
  });

  it('offers a rule only for an address nothing answers', async () => {
    vi.mocked(api.testRedirect).mockResolvedValue({ outcome: 'none' });
    const { onAddFor } = renderDialog();

    await ask('/lost');
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Aggiungi un reindirizzamento',
      }),
    );

    expect(onAddFor).toHaveBeenCalledWith('/lost');
  });

  it('does not offer one where a page answers', async () => {
    vi.mocked(api.testRedirect).mockResolvedValue({
      outcome: 'page',
      path: '/it/x',
    });
    renderDialog();

    await ask('/it/x');

    await screen.findByText(/risponde una pagina/);
    expect(
      screen.queryByRole('button', { name: 'Aggiungi un reindirizzamento' }),
    ).toBeNull();
  });

  // An answer belongs to the address it was asked of.
  it('takes the answer away when the address is changed', async () => {
    vi.mocked(api.testRedirect).mockResolvedValue({ outcome: 'none' });
    renderDialog();
    await ask('/lost');
    await screen.findByText(/Lì non risponde nulla/);

    fireEvent.change(screen.getByLabelText('Indirizzo'), {
      target: { value: '/lost-2' },
    });

    expect(screen.queryByText(/Lì non risponde nulla/)).toBeNull();
  });

  it('says it could not check, in words', async () => {
    vi.mocked(api.testRedirect).mockRejectedValue(new Error('down'));
    renderDialog();

    await ask('/x');

    expect(
      await screen.findByText('Non è stato possibile verificare l’indirizzo.'),
    ).toBeTruthy();
  });
});
