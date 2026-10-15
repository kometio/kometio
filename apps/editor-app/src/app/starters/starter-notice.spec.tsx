import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSiteRecord } from '@kometio/testing/records';
import * as sitesApi from '../../lib/sites-api-client';
import * as startersApi from '../../lib/starters-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { sessionAs } from '../../test/current-session.test-fixture';
import { useCurrentSession } from '../auth/use-current-session';
import { StarterNotice } from './starter-notice';

vi.mock('../../lib/sites-api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/sites-api-client')>()),
  getCurrentSite: vi.fn(),
}));
vi.mock('../../lib/starters-api-client', () => ({
  getStarterOffer: vi.fn(),
  applyStarter: vi.fn(),
}));
vi.mock('../auth/use-current-session', () => ({ useCurrentSession: vi.fn() }));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: (await import('../../test/router-link.test-fixture')).StubLink,
}));

const offer = (available: boolean) => ({
  available,
  language: 'it' as const,
  fallback: false,
  starters: [
    { id: 'studio' as const, themeName: 'classic', themeAvailable: true },
    { id: 'portfolio' as const, themeName: 'classic', themeAvailable: true },
    { id: 'blog' as const, themeName: 'paper', themeAvailable: true },
  ],
});

function renderNotice() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <StarterNotice />
    </QueryClientProvider>,
  );
}

/*
 * The way back to the choice a new site was offered (docs/adr/0136), for
 * whoever skipped it. A fact about the site: there while it is still the one
 * the wizard made, drawn for who may act on it, and silent when unsure.
 */
describe('StarterNotice', () => {
  beforeEach(() => {
    vi.mocked(sitesApi.getCurrentSite).mockResolvedValue(buildSiteRecord());
    vi.mocked(useCurrentSession).mockReturnValue(sessionAs('admin'));
    vi.mocked(startersApi.getStarterOffer).mockResolvedValue(offer(true));
  });

  afterEach(() => vi.resetAllMocks());

  it('tells an administrator the site has only its first page, with a way to choose', async () => {
    renderNotice();

    const notice = await screen.findByRole('status');

    expect(notice.textContent).toMatch(/solo la prima pagina/i);
    expect(
      screen
        .getByRole('link', { name: /scegli un esempio/i })
        .getAttribute('href'),
    ).toBe('/starter');
  });

  it('says nothing once the site has something of its own', async () => {
    vi.mocked(startersApi.getStarterOffer).mockResolvedValue(offer(false));

    renderNotice();

    await waitFor(() => expect(startersApi.getStarterOffer).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says nothing to somebody who could not act on it, and does not even ask', async () => {
    vi.mocked(useCurrentSession).mockReturnValue(sessionAs('publisher'));

    renderNotice();

    await waitFor(() => expect(sitesApi.getCurrentSite).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
    expect(startersApi.getStarterOffer).not.toHaveBeenCalled();
  });

  it('says nothing when it cannot find out: a suggestion is only worth making when it is true', async () => {
    vi.mocked(startersApi.getStarterOffer).mockRejectedValue(new Error('down'));

    renderNotice();

    await waitFor(() => expect(startersApi.getStarterOffer).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
  });
});
