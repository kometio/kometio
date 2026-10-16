import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { buildSiteRecord } from '@kometio/testing/records';
import * as api from '../../lib/sites-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { TooltipProvider } from '../../components/ui/tooltip';
import { ToastProvider } from '../shell/toast-provider';
import { NewsletterSettingsSection } from './newsletter-settings-section';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useBlocker: () => ({ status: 'idle' as const }) };
});

vi.mock('../../lib/sites-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/sites-api-client')>();
  return { ...actual, updateNewsletterCaptcha: vi.fn() };
});

function renderSection(newsletterCaptchaEnabled: boolean) {
  const site = buildSiteRecord({ newsletterCaptchaEnabled });
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TooltipProvider>
        <ToastProvider>
          <NewsletterSettingsSection site={site} />
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('NewsletterSettingsSection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the choice the site has, and turns it from its own label', () => {
    renderSection(true);
    const captcha = screen.getByRole('switch', {
      name: 'Chiedi ai visitatori di superare il captcha',
    });
    expect(captcha.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(
      screen.getByText('Chiedi ai visitatori di superare il captcha'),
    );

    expect(captcha.getAttribute('aria-checked')).toBe('false');
  });

  it('asks before turning the captcha off, and does nothing until the answer is yes', async () => {
    vi.mocked(api.updateNewsletterCaptcha).mockResolvedValue(
      buildSiteRecord({ newsletterCaptchaEnabled: false }),
    );
    renderSection(true);

    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: /^salva$/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('uno script può aggiungere indirizzi');
    expect(api.updateNewsletterCaptcha).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Spegni' }));

    await waitFor(() =>
      expect(api.updateNewsletterCaptcha).toHaveBeenCalledWith('site-1', {
        newsletterCaptchaEnabled: false,
      }),
    );
  });

  it('turns the captcha on with no question — that is not the risky way round', async () => {
    vi.mocked(api.updateNewsletterCaptcha).mockResolvedValue(
      buildSiteRecord({ newsletterCaptchaEnabled: true }),
    );
    renderSection(false);

    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: /^salva$/i }));

    await waitFor(() =>
      expect(api.updateNewsletterCaptcha).toHaveBeenCalledWith('site-1', {
        newsletterCaptchaEnabled: true,
      }),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
