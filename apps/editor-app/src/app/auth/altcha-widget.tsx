import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { AltchaWidgetElement } from 'altcha/types/generic';
import { loadAltcha } from './altcha-loader';

export interface AltchaWidgetProps {
  /** Where the widget asks for a challenge: the API's, from the address this editor talks to. */
  challengeUrl: string;
  /** `null` while there is nothing to submit: before it is solved, once it expires, or when it fails. */
  onToken: (token: string | null) => void;
  /**
   * Incremented by the caller to ask for a new challenge: a solution is
   * spent when the server refuses an attempt (it can be used once), and the
   * widget still looks verified for the old one.
   */
  resetSignal?: number;
}

/**
 * What the widget says in a `statechange`: its token once it is verified, and
 * nothing in any other state (verifying, expired, failed). The event comes from
 * a custom element that does not type its own, so its detail is read as what
 * it is, unknown, and only a token that is a string is taken.
 */
function solutionOf(event: Event): string | null {
  if (!(event instanceof CustomEvent)) return null;
  const detail: unknown = event.detail;
  if (typeof detail !== 'object' || detail === null) return null;
  if (!('state' in detail) || detail.state !== 'verified') return null;
  return 'payload' in detail && typeof detail.payload === 'string'
    ? detail.payload
    : null;
}

/**
 * The widget of the captcha built into Kometio (docs/adr/0103): a checkbox
 * that solves a proof of work in the background and ticks itself, which
 * TurnstileWidget's counterpart for a deployment with no Cloudflare keys. It
 * takes the same props, so the forms that draw one draw the other.
 *
 * It is a custom element, made here and not written in JSX so that its events
 * are attached before it starts: `auto="onload"` makes it ask for its
 * challenge the moment it is in the page, and a form that is slow to listen
 * would miss "verified" and leave the button disabled for ever.
 */
export function AltchaWidget({
  challengeUrl,
  onToken,
  resetSignal,
}: AltchaWidgetProps) {
  const { i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<AltchaWidgetElement | null>(null);
  // The latest callback without remounting the widget (and asking for a new
  // challenge) every time the form re-renders, as TurnstileWidget does.
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  });

  const language = i18n.language;

  useEffect(() => {
    let cancelled = false;

    void loadAltcha(language).then(
      () => {
        const container = containerRef.current;
        if (cancelled || !container) return;
        const widget = document.createElement('altcha-widget');
        widget.setAttribute('challenge', challengeUrl);
        widget.setAttribute('auto', 'onload');
        widget.setAttribute('language', language);
        widget.setAttribute('type', 'checkbox');
        widget.addEventListener('statechange', (event) => {
          onTokenRef.current(solutionOf(event));
        });
        container.append(widget);
        widgetRef.current = widget;
      },
      () => onTokenRef.current(null),
    );

    return () => {
      cancelled = true;
      widgetRef.current?.remove();
      widgetRef.current = null;
    };
  }, [challengeUrl, language]);

  const isFirstResetRun = useRef(true);
  useEffect(() => {
    // The mount is not a reset: the widget is still on its first challenge.
    if (isFirstResetRun.current) {
      isFirstResetRun.current = false;
      return;
    }
    const widget = widgetRef.current;
    if (resetSignal === undefined || !widget) return;
    widget.reset();
    void widget.verify();
  }, [resetSignal]);

  return <div ref={containerRef} className="w-full" />;
}
