import { useEffect } from 'react';
import { afterEach } from 'vitest';
import type { AltchaWidgetProps } from '../app/auth/altcha-widget';

/** What the fake widget hands a form once it "solves" its challenge. */
export const FAKE_CAPTCHA_TOKEN = 'fake-captcha-token-for-tests';

let solves = true;

/**
 * For the one test that is about the moment before the visitor has solved
 * anything: the widget stays as it is when a form is first drawn, without a
 * token. Put back after each test.
 */
export function captchaStaysUnsolved(): void {
  solves = false;
}

afterEach(() => {
  solves = true;
});

/**
 * Stands in for the real widget in every test (test-setup.ts): it is a
 * download of its own and runs a proof of work in a worker, neither of which
 * belongs in jsdom. It hands over a fixed token as soon as it is drawn, and
 * again when a form asks for a new challenge, so every fill-and-submit flow
 * works without knowing a captcha exists.
 */
export function FakeAltchaWidget({ onToken, resetSignal }: AltchaWidgetProps) {
  useEffect(() => {
    if (solves) onToken(FAKE_CAPTCHA_TOKEN);
    // A new challenge is a new token: the form's callback is stable enough
    // that depending on the signal alone is what is meant here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);
  return null;
}
