// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { beforeAfterBehaviors } from './before-after';
import { runBlockBehaviors } from './run-block-behaviors';

function renderBeforeAfter(): HTMLElement {
  document.body.innerHTML = `
    <div class="kometio-before-after" style="--reveal: 50%">
      <input type="range" class="kometio-before-after__slider" min="0" max="100" value="50" />
    </div>
  `;
  return document.querySelector<HTMLElement>('.kometio-before-after')!;
}

describe('beforeAfterBehaviors', () => {
  it('updates the --reveal custom property when the slider moves', () => {
    const root = renderBeforeAfter();
    const slider = root.querySelector<HTMLInputElement>(
      '.kometio-before-after__slider',
    )!;

    runBlockBehaviors(document, beforeAfterBehaviors);
    slider.value = '75';
    slider.dispatchEvent(new Event('input'));

    expect(root.style.getPropertyValue('--reveal')).toBe('75%');
  });

  it('does nothing when the block has no slider', () => {
    document.body.innerHTML = '<div class="kometio-before-after"></div>';

    expect(() =>
      runBlockBehaviors(document, beforeAfterBehaviors),
    ).not.toThrow();
  });

  it('is idempotent: a second run does not attach a duplicate listener', () => {
    const root = renderBeforeAfter();
    const slider = root.querySelector<HTMLInputElement>(
      '.kometio-before-after__slider',
    )!;

    runBlockBehaviors(document, beforeAfterBehaviors);
    runBlockBehaviors(document, beforeAfterBehaviors);
    slider.value = '20';
    slider.dispatchEvent(new Event('input'));

    expect(root.style.getPropertyValue('--reveal')).toBe('20%');
  });
});
