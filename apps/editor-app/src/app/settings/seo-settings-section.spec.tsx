import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { buildSiteRecord } from '@kometio/testing/records';
import * as api from '../../lib/sites-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { TooltipProvider } from '../../components/ui/tooltip';
import { ToastProvider } from '../shell/toast-provider';
import { SeoSettingsSection } from './seo-settings-section';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useBlocker: () => ({ status: 'idle' as const }) };
});

vi.mock('../../lib/sites-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/sites-api-client')>();
  return { ...actual, updateSeoSettings: vi.fn() };
});

function renderSection(searchEngineIndexingEnabled: boolean) {
  const site = buildSiteRecord({ searchEngineIndexingEnabled });
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TooltipProvider>
        <ToastProvider>
          <SeoSettingsSection site={site} />
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('SeoSettingsSection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('turns the switch from its own label', () => {
    renderSection(true);
    const indexing = screen.getByRole('switch', {
      name: "Consenti l'indicizzazione",
    });

    fireEvent.click(screen.getByText("Consenti l'indicizzazione"));

    expect(indexing.getAttribute('aria-checked')).toBe('false');
  });

  it('asks before turning indexing off, and does nothing until the answer is yes', async () => {
    vi.mocked(api.updateSeoSettings).mockResolvedValue(
      buildSiteRecord({ searchEngineIndexingEnabled: false }),
    );
    renderSection(true);

    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: /^salva$/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('smetteranno di mostrare il sito');
    expect(api.updateSeoSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Spegni' }));

    await waitFor(() =>
      expect(api.updateSeoSettings).toHaveBeenCalledWith('site-1', {
        searchEngineIndexingEnabled: false,
      }),
    );
  });

  it('turns indexing on with no question — that is not the risky way round', async () => {
    vi.mocked(api.updateSeoSettings).mockResolvedValue(
      buildSiteRecord({ searchEngineIndexingEnabled: true }),
    );
    renderSection(false);

    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: /^salva$/i }));

    await waitFor(() =>
      expect(api.updateSeoSettings).toHaveBeenCalledWith('site-1', {
        searchEngineIndexingEnabled: true,
      }),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
