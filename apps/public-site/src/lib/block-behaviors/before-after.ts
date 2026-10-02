import type { BlockBehavior } from './types';

// Idempotency guard: re-running this would attach a second 'input'
// listener to the same slider. See run-block-behaviors.ts.
const INITIALIZED_ATTR = 'data-kometio-before-after-initialized';

function wireBeforeAfter(container: HTMLElement): void {
  if (container.hasAttribute(INITIALIZED_ATTR)) return;
  container.setAttribute(INITIALIZED_ATTR, '');

  const slider = container.querySelector<HTMLInputElement>(
    '.kometio-before-after__slider',
  );
  slider?.addEventListener('input', () => {
    container.style.setProperty('--reveal', `${slider.value}%`);
  });
}

export const beforeAfterBehaviors: BlockBehavior[] = [
  { selector: '.kometio-before-after', wire: wireBeforeAfter },
];
