import type { BlockBehavior } from './types';

// Idempotency guard: a live-patched Tabs block would otherwise get a
// SECOND tablist inserted (see run-block-behaviors.ts's own doc comment)
// without removing the first, since this wiring isn't naturally safe to
// repeat — `insertBefore` doesn't know an old tablist is already there.
function wireTabs(root: HTMLElement): void {
  if (root.querySelector(':scope > .kometio-tabs__list')) return;

  // Not `:scope > .kometio-tab-panel`: in the editor canvas each child
  // block is wrapped in its own `data-kometio-block-id` div (`style=
  // "display:contents"`, invisible for layout but still a real DOM
  // node) so a Tab panel is a grandchild, not a direct child, of
  // `.kometio-tabs` there — only on the published site (no wrapper,
  // BlockRenderer.astro's Wrapper is a bare Fragment) is it a direct
  // child. A plain descendant selector works in both, and can't
  // accidentally pick up a nested Tabs' own panels: Tab.allowedChildTypes
  // doesn't include Tab/Tabs, so tabs-within-tabs can't exist.
  const panels = Array.from(
    root.querySelectorAll<HTMLElement>(':scope .kometio-tab-panel'),
  );
  if (panels.length === 0) return;

  const tablist = document.createElement('div');
  tablist.className = 'kometio-tabs__list';
  tablist.setAttribute('role', 'tablist');

  const buttons: HTMLButtonElement[] = [];

  function activate(index: number) {
    panels.forEach((panel, i) => {
      panel.hidden = i !== index;
    });
    buttons.forEach((button, i) => {
      button.setAttribute('aria-selected', String(i === index));
      button.tabIndex = i === index ? 0 : -1;
    });
  }

  panels.forEach((panel, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.className = 'kometio-tabs__tab';
    button.textContent = panel.dataset['tabLabel'] ?? '';
    const id = `kometio-tab-${crypto.randomUUID()}`;
    button.id = id;
    panel.setAttribute('aria-labelledby', id);
    button.addEventListener('click', () => activate(index));
    button.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        const next = (index + 1) % panels.length;
        activate(next);
        buttons[next]?.focus();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const prev = (index - 1 + panels.length) % panels.length;
        activate(prev);
        buttons[prev]?.focus();
      }
    });
    buttons.push(button);
    tablist.appendChild(button);
  });

  root.insertBefore(tablist, root.firstChild);
  activate(0);
}

export const tabsBehaviors: BlockBehavior[] = [
  { selector: '.kometio-tabs', wire: wireTabs },
];
