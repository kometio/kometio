import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CaptchaWidget } from './captcha-widget';

// The widget's own behaviour is altcha-widget.spec.tsx's; here only where it is
// told to ask for its challenge.
vi.mock('./altcha-widget', () => ({
  AltchaWidget: ({ challengeUrl }: { challengeUrl: string }) => (
    <div data-testid="captcha" data-challenge={challengeUrl} />
  ),
}));

describe('CaptchaWidget', () => {
  it('asks the API this editor talks to for its challenge', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api');

    const { getByTestId } = render(<CaptchaWidget onToken={vi.fn()} />);

    expect(getByTestId('captcha').dataset['challenge']).toBe(
      'https://api.example.test/api/captcha/challenge',
    );
  });
});
