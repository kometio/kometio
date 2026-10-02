// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { countdownBehaviors } from './countdown';
import { runBlockBehaviors } from './run-block-behaviors';

function renderCountdown(targetDate: string): HTMLElement {
  document.body.innerHTML = `
    <div class="kometio-countdown" data-target-date="${targetDate}">
      <div class="kometio-countdown__timer">
        <span data-unit="days">00</span>
        <span data-unit="hours">00</span>
        <span data-unit="minutes">00</span>
        <span data-unit="seconds">00</span>
      </div>
      <p class="kometio-countdown__expired" hidden></p>
    </div>
  `;
  return document.querySelector<HTMLElement>('.kometio-countdown')!;
}

describe('countdownBehaviors', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down to a future target date', () => {
    const future = new Date(Date.now() + 90_061_000).toISOString(); // 1d 1h 1m 1s
    renderCountdown(future);

    runBlockBehaviors(document, countdownBehaviors);

    expect(document.querySelector('[data-unit="days"]')?.textContent).toBe(
      '01',
    );
  });

  it('shows the expired message for a target date already in the past', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const root = renderCountdown(past);

    runBlockBehaviors(document, countdownBehaviors);

    expect(root.querySelector('.kometio-countdown__timer')).toHaveProperty(
      'hidden',
      true,
    );
    expect(root.querySelector('.kometio-countdown__expired')).toHaveProperty(
      'hidden',
      false,
    );
  });

  it('does nothing for an element with no valid target date', () => {
    document.body.innerHTML = '<div class="kometio-countdown"></div>';

    expect(() => runBlockBehaviors(document, countdownBehaviors)).not.toThrow();
  });

  it('is idempotent: running it twice does not attach a second timer', () => {
    const future = new Date(Date.now() + 10_000).toISOString();
    renderCountdown(future);
    const setIntervalSpy = vi.spyOn(global, 'setInterval');

    runBlockBehaviors(document, countdownBehaviors);
    runBlockBehaviors(document, countdownBehaviors);

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
  });
});
