import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SiteAiSettingsResponse } from '@kometio/api-contracts';
import { ApiError } from '../../lib/http-client';
import * as api from '../../lib/page-generation-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { WithToasts } from '../../test/toasts.test-fixture';
import { chooseOption } from '../../test/select.test-fixture';
import { AiSettingsSection } from './ai-settings-section';

// The save bar asks before an in-app link throws work away, which needs a
// router; here nothing is being left.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useBlocker: () => ({ status: 'idle' as const }) };
});

vi.mock('../../lib/page-generation-api-client', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../lib/page-generation-api-client')
  >()),
  getAiSettings: vi.fn(),
  updateAiSettings: vi.fn(),
  removeAiSettings: vi.fn(),
}));

const configured: SiteAiSettingsResponse = {
  enabled: true,
  configured: true,
  provider: 'anthropic',
  model: 'claude-opus-5',
  baseUrl: null,
  apiKeyHint: 'Q7x2',
};

function renderSection() {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <WithToasts>
        <AiSettingsSection siteId="site-1" />
      </WithToasts>
    </QueryClientProvider>,
  );
}

describe('AiSettingsSection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('says why there is nothing to set on a server with no secrets key', async () => {
    vi.mocked(api.getAiSettings).mockResolvedValue({
      ...configured,
      enabled: false,
      configured: false,
    });
    renderSection();

    await screen.findByText(/non ha un posto sicuro dove tenere una chiave/);
    expect(screen.queryByLabelText('Chiave API')).toBeNull();
  });

  it('shows only the last four characters of the key, and keeps it when the field is left empty', async () => {
    vi.mocked(api.getAiSettings).mockResolvedValue(configured);
    vi.mocked(api.updateAiSettings).mockResolvedValue({
      ...configured,
      model: 'claude-sonnet-5',
    });
    renderSection();

    await screen.findByText(
      'È salvata una chiave che finisce con Q7x2. Lascia vuoto per tenerla.',
    );
    expect(screen.getByLabelText<HTMLInputElement>('Chiave API').value).toBe(
      '',
    );
    fireEvent.change(screen.getByLabelText('Modello'), {
      target: { value: 'claude-sonnet-5' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Salva' }));

    await waitFor(() =>
      expect(api.updateAiSettings).toHaveBeenCalledWith('site-1', {
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        baseUrl: null,
      }),
    );
    await screen.findByText('Impostazioni AI salvate');
  });

  it('asks for the server address for an OpenAI-compatible provider, and sends it', async () => {
    vi.mocked(api.getAiSettings).mockResolvedValue({
      ...configured,
      configured: false,
      provider: null,
      model: null,
      apiKeyHint: null,
    });
    vi.mocked(api.updateAiSettings).mockResolvedValue(configured);
    renderSection();

    chooseOption(
      await screen.findByLabelText('Provider'),
      /Compatibile OpenAI/,
    );
    // Claude's model name means nothing to another server.
    expect(screen.getByLabelText<HTMLInputElement>('Modello').value).toBe('');
    fireEvent.change(screen.getByLabelText('Indirizzo del server'), {
      target: { value: 'http://localhost:11434/v1' },
    });
    fireEvent.change(screen.getByLabelText('Modello'), {
      target: { value: 'qwen3:14b' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Salva' }));

    await waitFor(() =>
      expect(api.updateAiSettings).toHaveBeenCalledWith('site-1', {
        provider: 'openai-compatible',
        model: 'qwen3:14b',
        baseUrl: 'http://localhost:11434/v1',
      }),
    );
  });

  it('asks for the key again when the server changes, and says why', async () => {
    vi.mocked(api.getAiSettings).mockResolvedValue({
      ...configured,
      provider: 'openai-compatible',
      model: 'gpt-5',
      baseUrl: 'https://api.openai.com/v1',
    });
    renderSection();

    const key = await screen.findByLabelText<HTMLInputElement>('Chiave API');
    expect(key.required).toBe(false);
    fireEvent.change(screen.getByLabelText('Indirizzo del server'), {
      target: { value: 'https://collector.example.com/v1' },
    });

    expect(key.required).toBe(true);
    screen.getByText(/viene inviata solo al server per cui è stata inserita/);
  });

  it('puts the server’s refusal in words, not as a code', async () => {
    vi.mocked(api.getAiSettings).mockResolvedValue(configured);
    vi.mocked(api.updateAiSettings).mockRejectedValue(
      new ApiError(400, { message: 'api-key-for-new-server', statusCode: 400 }),
    );
    renderSection();

    // Nothing to save until something has changed: a key typed is a change.
    fireEvent.change(await screen.findByLabelText('Chiave API'), {
      target: { value: 'sk-altro-server' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Salva' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(
      /viene inviata solo al server per cui è stata inserita/,
    );
  });

  it('has no bar until something changes, and Cancel puts back what the server holds', async () => {
    vi.mocked(api.getAiSettings).mockResolvedValue(configured);
    renderSection();

    const model = await screen.findByLabelText<HTMLInputElement>('Modello');
    expect(screen.queryByRole('button', { name: 'Salva' })).toBeNull();

    fireEvent.change(model, { target: { value: 'un-altro-modello' } });
    expect(await screen.findByText('Modifiche non salvate')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(model.value).toBe('claude-opus-5');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Salva' })).toBeNull(),
    );
  });

  it('removes the settings only after asking', async () => {
    vi.mocked(api.getAiSettings).mockResolvedValue(configured);
    vi.mocked(api.removeAiSettings).mockResolvedValue(undefined);
    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: 'Rimuovi' }));
    expect(api.removeAiSettings).not.toHaveBeenCalled();
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Rimuovi' }));

    await waitFor(() =>
      expect(api.removeAiSettings).toHaveBeenCalledWith('site-1'),
    );
  });
});
