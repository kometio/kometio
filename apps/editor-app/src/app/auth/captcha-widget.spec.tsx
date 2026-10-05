import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaptchaWidget } from './captcha-widget';

// The built-in widget's own behaviour is altcha-widget.spec.tsx's; here only
// which of the two a form is given.
vi.mock('./altcha-widget', () => ({
  AltchaWidget: ({ challengeUrl }: { challengeUrl: string }) => (
    <div data-testid="built-in-captcha" data-challenge={challengeUrl} />
  ),
}));

describe('CaptchaWidget', () => {
  const realTurnstile = window.turnstile;

  afterEach(() => {
    window.turnstile = realTurnstile;
    delete window.__KOMETIO_CONFIG__;
  });

  /*
   * One rule for the editor and the API (docs/adr/0103): a deployment with
   * both Cloudflare keys is on Turnstile, one with neither is on the captcha
   * built into Kometio. A form that drew one while the server checked the
   * other could never be sent.
   */
  it("draws Cloudflare's widget, with the site's key, when the deployment has one", () => {
    const render_ = vi.fn(() => 'widget-id');
    window.turnstile = { render: render_, reset: vi.fn(), remove: vi.fn() };
    window.__KOMETIO_CONFIG__ = { turnstileSiteKey: '0xcontainer' };

    const { queryByTestId } = render(<CaptchaWidget onToken={vi.fn()} />);

    expect(render_).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ sitekey: '0xcontainer' }),
    );
    expect(queryByTestId('built-in-captcha')).toBeNull();
  });

  it('draws the captcha built into Kometio when it has none, asking the API this editor talks to for its challenge', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api');
    window.turnstile = { render: vi.fn(), reset: vi.fn(), remove: vi.fn() };

    const { findByTestId } = render(<CaptchaWidget onToken={vi.fn()} />);

    const builtIn = await findByTestId('built-in-captcha');
    expect(builtIn.dataset['challenge']).toBe(
      'https://api.example.test/api/captcha/challenge',
    );
    await waitFor(() =>
      expect(window.turnstile?.render).not.toHaveBeenCalled(),
    );
  });
});
