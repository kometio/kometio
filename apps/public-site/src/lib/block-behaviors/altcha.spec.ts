// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runBlockBehaviors } from './run-block-behaviors';

// The widget is a download of its own and runs a proof of work in a worker:
// neither belongs in jsdom, and the build is what resolves them. Here the
// imports are stand-ins, and what is tested is what the behavior does with the
// slot it is given.
vi.mock('altcha/external', () => ({}));
vi.mock('altcha/altcha.css', () => ({}));
vi.mock('altcha/workers/pbkdf2?worker', () => ({
  default: class FakeWorker {},
}));
vi.mock('altcha/i18n/it', () => ({}));

type AltchaGlobal = {
  algorithms: { set: (name: string, worker: () => unknown) => void };
};

async function importFreshBehaviors() {
  vi.resetModules();
  return (await import('./altcha')).altchaBehaviors;
}

function slot(attributes = ''): string {
  return `<form><div data-kometio-altcha data-challenge="/api/captcha/challenge" ${attributes}></div></form>`;
}

/** The behavior imports the widget, then its translation, then draws it: dynamic imports take a turn of the event loop each. */
const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

let registered = vi.fn();

describe('altchaBehaviors', () => {
  beforeEach(() => {
    registered = vi.fn();
    (globalThis as { $altcha?: AltchaGlobal }).$altcha = {
      algorithms: { set: registered },
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete (globalThis as { $altcha?: AltchaGlobal }).$altcha;
  });

  it('puts the widget in its slot, asking this site for the challenge and naming its field so the proxy finds it', async () => {
    document.body.innerHTML = slot('data-language="en-US"');
    const altchaBehaviors = await importFreshBehaviors();

    runBlockBehaviors(document, altchaBehaviors);
    await settle();

    const widget = document.querySelector('altcha-widget');
    expect(widget?.getAttribute('challenge')).toBe('/api/captcha/challenge');
    expect(widget?.getAttribute('name')).toBe('_captcha');
    // Asked for when the visitor starts on the form, not when the page loads.
    expect(widget?.getAttribute('auto')).toBe('onfocus');
    expect(widget?.getAttribute('language')).toBe('en');
  });

  it('registers the browser’s own crypto, in a worker of this site, as the way to solve it', async () => {
    document.body.innerHTML = slot();
    const altchaBehaviors = await importFreshBehaviors();

    runBlockBehaviors(document, altchaBehaviors);
    await settle();

    expect(registered).toHaveBeenCalledTimes(1);
    expect(registered).toHaveBeenCalledWith(
      'PBKDF2/SHA-256',
      expect.any(Function),
    );
  });

  it('loads the widget once however many forms the page has, and puts one in each', async () => {
    document.body.innerHTML = slot() + slot();
    const altchaBehaviors = await importFreshBehaviors();

    runBlockBehaviors(document, altchaBehaviors);
    await settle();

    expect(document.querySelectorAll('altcha-widget')).toHaveLength(2);
    expect(registered).toHaveBeenCalledTimes(1);
  });

  it('puts only one widget in a slot, however many times the behaviors run (a block patched in the canvas)', async () => {
    document.body.innerHTML = slot();
    const altchaBehaviors = await importFreshBehaviors();

    runBlockBehaviors(document, altchaBehaviors);
    runBlockBehaviors(document, altchaBehaviors);
    await settle();
    runBlockBehaviors(document, altchaBehaviors);
    await settle();

    expect(document.querySelectorAll('altcha-widget')).toHaveLength(1);
  });

  it('speaks Italian on an Italian page', async () => {
    document.body.innerHTML = slot('data-language="it-IT"');
    const altchaBehaviors = await importFreshBehaviors();

    runBlockBehaviors(document, altchaBehaviors);
    await settle();

    expect(
      document.querySelector('altcha-widget')?.getAttribute('language'),
    ).toBe('it');
  });

  it('falls back to English for a language the site has no words for', async () => {
    document.body.innerHTML = slot('data-language="de-DE"');
    const altchaBehaviors = await importFreshBehaviors();

    runBlockBehaviors(document, altchaBehaviors);
    await settle();

    expect(
      document.querySelector('altcha-widget')?.getAttribute('language'),
    ).toBe('en');
  });

  it('leaves a slot with no challenge address alone', async () => {
    document.body.innerHTML = '<div data-kometio-altcha></div>';
    const altchaBehaviors = await importFreshBehaviors();

    runBlockBehaviors(document, altchaBehaviors);
    await settle();

    expect(document.querySelector('altcha-widget')).toBeNull();
    expect(registered).not.toHaveBeenCalled();
  });
});
