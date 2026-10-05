import { apiBaseUrl } from '../../lib/runtime-config';
import { turnstileSiteKey } from '../../lib/turnstile-site-key';
import { AltchaWidget } from './altcha-widget';
import { TurnstileWidget } from './turnstile-widget';

export interface CaptchaWidgetProps {
  /** `null` while there is nothing to submit: before it is solved, once it expires, or when it fails. */
  onToken: (token: string | null) => void;
  /** Incremented to ask for a new challenge after the server refused the last answer. */
  resetSignal?: number;
}

/**
 * The captcha of the form, whichever this deployment has (docs/adr/0103):
 * Cloudflare Turnstile when the site gave its key, and the one built into
 * Kometio when it did not. The same rule the API follows, so the widget and
 * the verifier cannot be on different ones, and the forms that need a captcha
 * do not know which it is.
 */
export function CaptchaWidget({ onToken, resetSignal }: CaptchaWidgetProps) {
  const siteKey = turnstileSiteKey();
  if (siteKey !== null) {
    return (
      <TurnstileWidget
        siteKey={siteKey}
        onToken={onToken}
        resetSignal={resetSignal}
      />
    );
  }
  return (
    <AltchaWidget
      challengeUrl={`${apiBaseUrl()}/captcha/challenge`}
      onToken={onToken}
      resetSignal={resetSignal}
    />
  );
}
