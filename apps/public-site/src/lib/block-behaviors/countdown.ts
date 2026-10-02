import type { BlockBehavior } from './types';

// Idempotency guard: without it, re-running this on an already-ticking
// countdown would attach a second, independent setInterval — harmless to
// the displayed value (both intervals write the same number), but a real
// leak (never cleared except on natural expiry) if patched repeatedly.
// See run-block-behaviors.ts.
const INITIALIZED_ATTR = 'data-kometio-countdown-initialized';

function wireCountdown(root: HTMLElement): void {
  if (root.hasAttribute(INITIALIZED_ATTR)) return;
  root.setAttribute(INITIALIZED_ATTR, '');

  const targetDate = root.dataset.targetDate;
  if (!targetDate) return;
  const target = new Date(targetDate).getTime();
  if (Number.isNaN(target)) return;

  const timerEl = root.querySelector<HTMLElement>('.kometio-countdown__timer');
  const expiredEl = root.querySelector<HTMLElement>(
    '.kometio-countdown__expired',
  );
  const daysEl = root.querySelector<HTMLElement>('[data-unit="days"]');
  const hoursEl = root.querySelector<HTMLElement>('[data-unit="hours"]');
  const minutesEl = root.querySelector<HTMLElement>('[data-unit="minutes"]');
  const secondsEl = root.querySelector<HTMLElement>('[data-unit="seconds"]');

  function pad(value: number): string {
    return String(value).padStart(2, '0');
  }

  // Returns true once the target has passed, so the caller knows when
  // to stop ticking instead of the interval outliving its own timer.
  function updateOrExpire(): boolean {
    const remaining = target - Date.now();
    if (remaining <= 0) {
      if (timerEl) timerEl.hidden = true;
      if (expiredEl) expiredEl.hidden = false;
      return true;
    }
    const totalSeconds = Math.floor(remaining / 1000);
    if (daysEl) daysEl.textContent = pad(Math.floor(totalSeconds / 86400));
    if (hoursEl)
      hoursEl.textContent = pad(Math.floor((totalSeconds % 86400) / 3600));
    if (minutesEl)
      minutesEl.textContent = pad(Math.floor((totalSeconds % 3600) / 60));
    if (secondsEl) secondsEl.textContent = pad(totalSeconds % 60);
    return false;
  }

  if (!updateOrExpire()) {
    const intervalId = setInterval(() => {
      if (updateOrExpire()) clearInterval(intervalId);
    }, 1000);
  }
}

export const countdownBehaviors: BlockBehavior[] = [
  { selector: '.kometio-countdown', wire: wireCountdown },
];
