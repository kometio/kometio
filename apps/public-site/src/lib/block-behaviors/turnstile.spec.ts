// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBlockBehaviors } from './run-block-behaviors';
import type { turnstileBehaviors as TurnstileBehaviors } from './turnstile';

// turnstile.ts caches its script-load promise at module scope (deliberately
// — the real script must only ever load once per page). Each test needs a
// fresh module instance to test that caching in isolation, hence the
// dynamic re-import instead of a single top-level one.
async function importFreshTurnstileBehaviors(): Promise<
  typeof TurnstileBehaviors
> {
  vi.resetModules();
  const mod = await import('./turnstile');
  return mod.turnstileBehaviors;
}

function dispatchScriptLoad(): void {
  document
    .querySelector<HTMLScriptElement>('script[src*="turnstile"]')
    ?.dispatchEvent(new Event('load'));
}

describe('turnstileBehaviors', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    delete (window as { turnstile?: unknown }).turnstile;
  });

  it('loads the Turnstile script with render=explicit and renders the widget once loaded', async () => {
    const render = vi.fn().mockReturnValue('widget-1');
    document.body.innerHTML =
      '<div class="cf-turnstile" data-sitekey="site-key-abc"></div>';
    const turnstileBehaviors = await importFreshTurnstileBehaviors();

    runBlockBehaviors(document, turnstileBehaviors);

    const script = document.querySelector<HTMLScriptElement>(
      'script[src*="turnstile"]',
    );
    expect(script?.src).toContain('render=explicit');

    window.turnstile = { render };
    dispatchScriptLoad();
    await Promise.resolve();

    expect(render).toHaveBeenCalledWith(
      document.querySelector('.cf-turnstile'),
      { sitekey: 'site-key-abc' },
    );
  });

  it('renders immediately, without loading a script, when turnstile is already loaded', async () => {
    const render = vi.fn().mockReturnValue('widget-1');
    window.turnstile = { render };
    document.body.innerHTML =
      '<div class="cf-turnstile" data-sitekey="site-key-abc"></div>';
    const turnstileBehaviors = await importFreshTurnstileBehaviors();

    runBlockBehaviors(document, turnstileBehaviors);
    await Promise.resolve();

    expect(document.querySelector('script[src*="turnstile"]')).toBeNull();
    expect(render).toHaveBeenCalledOnce();
  });

  it('is idempotent: never renders the same widget element twice', async () => {
    const render = vi.fn().mockReturnValue('widget-1');
    window.turnstile = { render };
    document.body.innerHTML =
      '<div class="cf-turnstile" data-sitekey="site-key-abc"></div>';
    const turnstileBehaviors = await importFreshTurnstileBehaviors();

    runBlockBehaviors(document, turnstileBehaviors);
    runBlockBehaviors(document, turnstileBehaviors);
    await Promise.resolve();

    expect(render).toHaveBeenCalledOnce();
  });

  it('skips a widget with no sitekey', async () => {
    document.body.innerHTML = '<div class="cf-turnstile"></div>';
    const turnstileBehaviors = await importFreshTurnstileBehaviors();

    expect(() => runBlockBehaviors(document, turnstileBehaviors)).not.toThrow();
    expect(document.querySelector('script[src*="turnstile"]')).toBeNull();
  });
});
