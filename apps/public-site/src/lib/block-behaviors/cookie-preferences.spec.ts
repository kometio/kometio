// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cookiePreferencesBehaviors } from './cookie-preferences';
import { runBlockBehaviors } from './run-block-behaviors';

function button(): HTMLButtonElement {
  document.body.innerHTML =
    '<button type="button" data-kometio-cookie-preferences>Cookie preferences</button>';
  const element = document.querySelector('button');
  if (!element) throw new Error('fixture has no button');
  return element;
}

describe('cookie preferences', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    Reflect.deleteProperty(window, 'kometioConsent');
  });

  it('asks the consent API to open the preferences', () => {
    const openPreferences = vi.fn();
    Object.defineProperty(window, 'kometioConsent', {
      value: { openPreferences },
      configurable: true,
    });
    const element = button();
    runBlockBehaviors(document, cookiePreferencesBehaviors);

    element.click();
    expect(openPreferences).toHaveBeenCalledTimes(1);
  });

  it('dispatches the event the banner listens for when the API is not there', () => {
    const listener = vi.fn();
    document.addEventListener('kometio-consent-open-preferences', listener);
    const element = button();
    runBlockBehaviors(document, cookiePreferencesBehaviors);

    element.click();
    expect(listener).toHaveBeenCalledTimes(1);
    document.removeEventListener('kometio-consent-open-preferences', listener);
  });

  it('opens once per click however often behaviours re-run', () => {
    const openPreferences = vi.fn();
    Object.defineProperty(window, 'kometioConsent', {
      value: { openPreferences },
      configurable: true,
    });
    const element = button();
    runBlockBehaviors(document, cookiePreferencesBehaviors);
    runBlockBehaviors(document, cookiePreferencesBehaviors);

    element.click();
    expect(openPreferences).toHaveBeenCalledTimes(1);
  });
});
