import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block } from '@kometio/shared-types';
import * as api from '../../lib/page-generation-api-client';
import { PageGenerationError } from '../../lib/page-generation-api-client';
import { useCurrentSession } from '../auth/use-current-session';
import { sessionAs } from '../../test/current-session.test-fixture';
import { GeneratePageDialog, pageOutline } from './generate-page-dialog';

vi.mock('../../lib/page-generation-api-client', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../lib/page-generation-api-client')
  >()),
  generatePage: vi.fn(),
}));

vi.mock('../auth/use-current-session', () => ({ useCurrentSession: vi.fn() }));

// An admin unless a test says otherwise.
beforeEach(() => {
  vi.mocked(useCurrentSession).mockReturnValue(sessionAs('admin'));
});

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: (await import('../../test/router-link.test-fixture')).StubLink,
}));

const page = {
  content: [{ id: 'h1', type: 'Hero', props: { title: 'Pane' } }],
  droppedCount: 0,
  placeholderCount: 0,
};

const existing: Block[] = [
  { id: 'a', type: 'Hero', props: { title: '<p>Pane <em>buono</em></p>' } },
  { id: 'b', type: 'Faq', props: {} },
];

function renderDialog(
  props: Partial<Parameters<typeof GeneratePageDialog>[0]> = {},
) {
  const onGenerated = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <GeneratePageDialog
      siteId="site-1"
      locale="it"
      open
      onOpenChange={onOpenChange}
      blocks={[]}
      onGenerated={onGenerated}
      {...props}
    />,
  );
  return { onGenerated, onOpenChange };
}

function describePage(text: string) {
  fireEvent.change(screen.getByLabelText('Cosa deve dire la pagina?'), {
    target: { value: text },
  });
}

describe('GeneratePageDialog', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('writes an empty page from the description and hands it over', async () => {
    vi.mocked(api.generatePage).mockResolvedValue(page);
    const { onGenerated, onOpenChange } = renderDialog();

    // An empty page has nothing to add to: no choice to make.
    expect(screen.queryByText('Sostituisci tutta la pagina')).toBeNull();
    describePage('La home di un forno');
    fireEvent.click(screen.getByRole('button', { name: 'Genera' }));

    await waitFor(() =>
      expect(onGenerated).toHaveBeenCalledWith(page, 'replace'),
    );
    expect(api.generatePage).toHaveBeenCalledWith(
      'site-1',
      { prompt: 'La home di un forno', locale: 'it' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('adds to a page that has blocks, telling the model what is there', async () => {
    vi.mocked(api.generatePage).mockResolvedValue(page);
    const { onGenerated } = renderDialog({ blocks: existing });

    describePage('Aggiungi le domande frequenti');
    fireEvent.click(screen.getByRole('button', { name: 'Genera' }));

    await waitFor(() =>
      expect(onGenerated).toHaveBeenCalledWith(page, 'append'),
    );
    expect(vi.mocked(api.generatePage).mock.calls[0][1]).toEqual({
      prompt: 'Aggiungi le domande frequenti',
      locale: 'it',
      existingOutline: ['Hero: Pane buono', 'Faq'],
    });
  });

  it('asks before replacing a page that has blocks', async () => {
    vi.mocked(api.generatePage).mockResolvedValue(page);
    const { onGenerated } = renderDialog({ blocks: existing });

    describePage('Rifai tutto');
    fireEvent.click(
      screen.getByRole('radio', { name: 'Sostituisci tutta la pagina' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Genera' }));

    expect(api.generatePage).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Genera e sostituisci' }),
    );
    await waitFor(() =>
      expect(onGenerated).toHaveBeenCalledWith(page, 'replace'),
    );
  });

  it('says what went wrong, and keeps the description to try again', async () => {
    vi.mocked(api.generatePage).mockRejectedValue(
      new PageGenerationError('rejected-credentials'),
    );
    const { onGenerated } = renderDialog();

    describePage('La home di un forno');
    fireEvent.click(screen.getByRole('button', { name: 'Genera' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Il provider ha rifiutato la chiave. Controllala in Integrazioni.',
    );
    expect(
      screen.getByLabelText<HTMLTextAreaElement>('Cosa deve dire la pagina?')
        .value,
    ).toBe('La home di un forno');
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it('shows how much has been written, and stops when asked', async () => {
    let seenSignal: AbortSignal | undefined;
    vi.mocked(api.generatePage).mockImplementation(
      (_site, _input, { onProgress, signal }) =>
        new Promise((_, reject) => {
          seenSignal = signal;
          onProgress?.(1240);
          signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const { onOpenChange } = renderDialog();

    describePage('La home di un forno');
    fireEvent.click(screen.getByRole('button', { name: 'Genera' }));

    await screen.findByText('Scrittura della pagina... 1240 caratteri finora');
    fireEvent.click(screen.getByRole('button', { name: 'Interrompi' }));
    expect(seenSignal?.aborted).toBe(true);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('starts at once with a prompt from the New page dialog', async () => {
    vi.mocked(api.generatePage).mockResolvedValue(page);
    const { onGenerated } = renderDialog({ initialPrompt: 'Chi siamo' });

    await waitFor(() =>
      expect(onGenerated).toHaveBeenCalledWith(page, 'replace'),
    );
    expect(vi.mocked(api.generatePage).mock.calls[0][1]).toMatchObject({
      prompt: 'Chi siamo',
    });
  });

  it('explains, instead of offering a form, when it cannot run here', () => {
    renderDialog({ unavailable: 'linked-translation' });

    screen.getByText(/condivide i blocchi con la pagina originale/);
    expect(screen.queryByLabelText('Cosa deve dire la pagina?')).toBeNull();
  });

  it('sends an administrator to the settings when no provider is set', () => {
    renderDialog({ unavailable: 'not-configured' });

    expect(
      screen
        .getByRole('link', { name: 'Apri Integrazioni' })
        .getAttribute('href'),
    ).toBe('/settings/ai');
  });
});

describe('pageOutline', () => {
  it('names each top-level block and its first words, as plain text', () => {
    expect(
      pageOutline([
        { type: 'Hero', props: { title: '', subtitle: 'x' } },
        {
          type: 'Text',
          props: { body: '<p>Il nostro <strong>forno</strong></p>' },
        },
      ]),
    ).toEqual(['Hero', 'Text: Il nostro forno']);
  });
});
