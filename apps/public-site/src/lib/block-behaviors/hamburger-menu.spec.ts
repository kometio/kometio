// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { hamburgerMenuBehaviors } from './hamburger-menu';
import { runBlockBehaviors } from './run-block-behaviors';

function renderMenu(): { root: HTMLElement; toggle: HTMLButtonElement } {
  document.body.innerHTML = `
    <div class="kometio-hamburger-menu">
      <button
        class="kometio-hamburger-menu__toggle"
        aria-expanded="false"
        data-label-open="Apri il menu"
        data-label-close="Chiudi il menu"
      ></button>
    </div>
  `;
  return {
    root: document.querySelector<HTMLElement>('.kometio-hamburger-menu')!,
    toggle: document.querySelector<HTMLButtonElement>(
      '.kometio-hamburger-menu__toggle',
    )!,
  };
}

describe('hamburgerMenuBehaviors', () => {
  it('toggles open/closed on click, updating aria-expanded and the label', () => {
    const { root, toggle } = renderMenu();
    runBlockBehaviors(document, hamburgerMenuBehaviors);

    toggle.click();
    expect(root.classList.contains('kometio-hamburger-menu--open')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Chiudi il menu');

    toggle.click();
    expect(root.classList.contains('kometio-hamburger-menu--open')).toBe(false);
    expect(toggle.getAttribute('aria-label')).toBe('Apri il menu');
  });

  it('closes on Escape', () => {
    const { root, toggle } = renderMenu();
    runBlockBehaviors(document, hamburgerMenuBehaviors);
    toggle.click();
    expect(root.classList.contains('kometio-hamburger-menu--open')).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(root.classList.contains('kometio-hamburger-menu--open')).toBe(false);
  });

  it('closes on a click outside the menu', () => {
    document.body.innerHTML = `
      <div class="kometio-hamburger-menu">
        <button class="kometio-hamburger-menu__toggle" data-label-open="Apri" data-label-close="Chiudi"></button>
      </div>
      <div id="outside"></div>
    `;
    const root = document.querySelector<HTMLElement>(
      '.kometio-hamburger-menu',
    )!;
    const toggle = document.querySelector<HTMLButtonElement>(
      '.kometio-hamburger-menu__toggle',
    )!;
    runBlockBehaviors(document, hamburgerMenuBehaviors);
    toggle.click();

    document
      .getElementById('outside')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(root.classList.contains('kometio-hamburger-menu--open')).toBe(false);
  });

  it('is idempotent: a second click after re-running only toggles once', () => {
    const { root, toggle } = renderMenu();
    runBlockBehaviors(document, hamburgerMenuBehaviors);
    runBlockBehaviors(document, hamburgerMenuBehaviors);

    toggle.click();

    expect(root.classList.contains('kometio-hamburger-menu--open')).toBe(true);
  });
});
