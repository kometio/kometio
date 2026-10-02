import { useEffect, useRef } from 'react';

interface TurnstileRenderOptions {
  sitekey: string;
  /** 'flexible' fills the container's width instead of the widget's own fixed 300px. */
  size?: 'normal' | 'flexible' | 'compact';
  callback: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
}

interface TurnstileGlobal {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileGlobal;
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

/**
 * A single `<script>` for the whole app, however many `TurnstileWidget`s
 * mount and unmount (login and forgotten-password can alternate within one
 * session, see routes/login.tsx) — a second identical `<script src>` would
 * reload the entire library for nothing.
 */
function loadTurnstileScript(onLoad: () => void): void {
  if (window.turnstile) {
    onLoad();
    return;
  }
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${SCRIPT_SRC}"]`,
  );
  if (existing) {
    existing.addEventListener('load', onLoad, { once: true });
    return;
  }
  const script = document.createElement('script');
  script.src = SCRIPT_SRC;
  script.async = true;
  script.defer = true;
  script.addEventListener('load', onLoad, { once: true });
  document.head.append(script);
}

export interface TurnstileWidgetProps {
  siteKey: string;
  /** `null` on expiry or error — the caller has to disable submit again until a new token arrives. */
  onToken: (token: string | null) => void;
  /**
   * Incremented by the caller to force a fresh challenge (security review
   * 2026-08-24, point 13) — a Turnstile token is single-use: after a login
   * or reset the server rejected, the widget still looks "verified" but
   * that particular token can no longer be spent. Without an explicit reset
   * the user would be stuck retrying with a dead token.
   */
  resetSignal?: number;
}

/**
 * A minimal wrapper around Cloudflare's `window.turnstile` script — not a
 * dedicated React package (none is in use in this repo, and the rest of the
 * Turnstile integration in this project is already "direct script", see
 * apps/public-site/src/components/blocks/Form.astro).
 */
export function TurnstileWidget({
  siteKey,
  onToken,
  resetSignal,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    function render(): void {
      if (cancelled || !containerRef.current || !window.turnstile) {
        return;
      }
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        // The widget renders at a fixed 300px inside a 350px form, so it
        // sat visibly off-centre under fields that filled the width.
        // `flexible` lets it take the width it is given; the container
        // below is what gives it one.
        size: 'flexible',
        callback: (token) => onToken(token),
        'expired-callback': () => onToken(null),
        'error-callback': () => onToken(null),
      });
    }

    loadTurnstileScript(render);

    return () => {
      cancelled = true;
      if (widgetIdRef.current) {
        window.turnstile?.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `onToken` is recreated on every render of the caller (a closure over `setState`); including it would remount the widget (and request a new one from Cloudflare) on every keystroke in the form.
  }, [siteKey]);

  const isFirstResetRun = useRef(true);
  useEffect(() => {
    // Skips the mount: a reset here would do nothing useful (the widget has
    // yet to complete its FIRST challenge) and would break this effect's
    // only purpose — reacting to a change AFTER mount, not to resetSignal's
    // initial value.
    if (isFirstResetRun.current) {
      isFirstResetRun.current = false;
      return;
    }
    if (resetSignal !== undefined && widgetIdRef.current) {
      window.turnstile?.reset(widgetIdRef.current);
    }
  }, [resetSignal]);

  return <div ref={containerRef} className="w-full" />;
}
