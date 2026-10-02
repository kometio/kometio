// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { runBlockBehaviors } from './run-block-behaviors';
import { tabsBehaviors } from './tabs';

function renderTabs(): HTMLElement {
  document.body.innerHTML = `
    <div class="kometio-tabs">
      <div class="kometio-tab-panel" data-tab-label="Uno" hidden>Panel one</div>
      <div class="kometio-tab-panel" data-tab-label="Due" hidden>Panel two</div>
    </div>
  `;
  return document.querySelector<HTMLElement>('.kometio-tabs')!;
}

describe('tabsBehaviors', () => {
  it('builds a tab bar from the panels present in the DOM', () => {
    const root = renderTabs();

    runBlockBehaviors(document, tabsBehaviors);

    const buttons = root.querySelectorAll('.kometio-tabs__tab');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.textContent).toBe('Uno');
    expect(buttons[1]?.textContent).toBe('Due');
  });

  it('activates the first panel and switches on click', () => {
    const root = renderTabs();
    runBlockBehaviors(document, tabsBehaviors);

    const [firstButton, secondButton] =
      root.querySelectorAll<HTMLButtonElement>('.kometio-tabs__tab');
    const [firstPanel, secondPanel] =
      root.querySelectorAll<HTMLElement>('.kometio-tab-panel');

    expect(firstPanel?.hidden).toBe(false);
    expect(secondPanel?.hidden).toBe(true);

    secondButton?.click();

    expect(firstPanel?.hidden).toBe(true);
    expect(secondPanel?.hidden).toBe(false);
    expect(firstButton?.getAttribute('aria-selected')).toBe('false');
    expect(secondButton?.getAttribute('aria-selected')).toBe('true');
  });

  it('is idempotent: running it again does not add a second tab bar', () => {
    const root = renderTabs();

    runBlockBehaviors(document, tabsBehaviors);
    runBlockBehaviors(document, tabsBehaviors);
    runBlockBehaviors(root, tabsBehaviors);

    expect(root.querySelectorAll('.kometio-tabs__list')).toHaveLength(1);
    expect(root.querySelectorAll('.kometio-tabs__tab')).toHaveLength(2);
  });

  it('does nothing for a Tabs block with no panels yet', () => {
    document.body.innerHTML = '<div class="kometio-tabs"></div>';

    expect(() => runBlockBehaviors(document, tabsBehaviors)).not.toThrow();
    expect(document.querySelector('.kometio-tabs__list')).toBeNull();
  });
});
