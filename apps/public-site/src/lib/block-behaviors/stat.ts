import type { BlockBehavior } from './types';

// No framework here on purpose (docs/adr/0007) — an IntersectionObserver
// triggers a requestAnimationFrame count-up from 0 to the target value the
// first time each stat scrolls into view, then stops watching it (a stat
// only needs to animate once). Jumps straight to the final value for
// visitors who prefer reduced motion, rather than skipping the animation
// silently.
const COUNT_UP_MS = 1500;

// Idempotency guard: re-running this would attach a second observer to the
// same element — harmless on its own (both would just animate the same
// target twice in near-lockstep), but wasteful. See run-block-behaviors.ts.
const INITIALIZED_ATTR = 'data-kometio-stat-initialized';

function animateCount(el: HTMLElement, target: number) {
  const numberEl = el.querySelector<HTMLElement>('.kometio-stat__number');
  if (!numberEl) return;

  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  if (prefersReducedMotion) {
    numberEl.textContent = String(target);
    return;
  }

  const start = performance.now();
  // An arrow function expression, not a function declaration: TS only
  // carries the `numberEl` null-narrowing from the check above into a
  // closure created after it, not into a hoisted function declaration.
  const tick = (now: number) => {
    const progress = Math.min((now - start) / COUNT_UP_MS, 1);
    numberEl.textContent = String(Math.round(target * progress));
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function wireStat(stat: HTMLElement): void {
  if (stat.hasAttribute(INITIALIZED_ATTR)) return;
  stat.setAttribute(INITIALIZED_ATTR, '');

  const observer = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const target = Number(entry.target.getAttribute('data-value'));
        if (!Number.isNaN(target)) {
          animateCount(entry.target as HTMLElement, target);
        }
        obs.unobserve(entry.target);
      }
    },
    { threshold: 0.4 },
  );
  observer.observe(stat);
}

export const statBehaviors: BlockBehavior[] = [
  { selector: '.kometio-stat', wire: wireStat },
];
