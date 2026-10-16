import { apiBaseUrl } from '../../lib/runtime-config';
import { AltchaWidget } from './altcha-widget';

export interface CaptchaWidgetProps {
  /** `null` while there is nothing to submit: before it is solved, once it expires, or when it fails. */
  onToken: (token: string | null) => void;
  /** Incremented to ask for a new challenge after the server refused the last answer. */
  resetSignal?: number;
}

/**
 * The captcha of the editor's forms: the one built into Kometio (docs/adr/0103,
 * 0145), asking the API this editor talks to for its challenge.
 */
export function CaptchaWidget({ onToken, resetSignal }: CaptchaWidgetProps) {
  return (
    <AltchaWidget
      challengeUrl={`${apiBaseUrl()}/captcha/challenge`}
      onToken={onToken}
      resetSignal={resetSignal}
    />
  );
}
