import type { BlockBehavior } from './types';

/**
 * The halves of the page a narrowing replaces: the lists themselves, and
 * the controls, whose own "you are here" marks move with it.
 */
const REGION_SELECTOR = '[data-kometio-grid], [data-kometio-term-list]';

// One delegated listener for the whole document, not one per control:
// every swap replaces the controls with fresh elements, and a listener
// attached to them would be thrown away with them. See
// run-block-behaviors.ts on why `wire` must be safe to re-run.
const INITIALIZED_ATTR = 'data-kometio-term-list-initialized';

/**
 * Puts the incoming page's lists and controls in place of this one's.
 *
 * Region by region, in document order, and only when both sides have the
 * same number of them: a page whose shape changed between the click and
 * the answer is a page this cannot safely patch, and the caller falls
 * back to letting the browser navigate.
 */
export function swapRegions(current: Document, incoming: Document): boolean {
  const here = [...current.querySelectorAll(REGION_SELECTOR)];
  const there = [...incoming.querySelectorAll(REGION_SELECTOR)];
  if (here.length === 0 || here.length !== there.length) return false;
  for (const [index, region] of here.entries()) {
    const replacement = there[index];
    if (replacement) region.replaceWith(replacement.cloneNode(true));
  }
  const title = incoming.querySelector('title')?.textContent;
  if (title) current.title = title;
  return true;
}

/**
 * Whether this click is ours to answer.
 *
 * Everything a browser gives a reader to open a link elsewhere — a middle
 * click, a modifier, a `target` — is left to the browser. Enhancing
 * those would take away a choice they made deliberately.
 */
export function isPlainActivation(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.defaultPrevented
  );
}

async function showNarrowed(href: string): Promise<boolean> {
  try {
    const response = await fetch(href, {
      headers: { 'X-Requested-With': 'kometio-term-list' },
    });
    if (!response.ok) return false;
    const incoming = new DOMParser().parseFromString(
      await response.text(),
      'text/html',
    );
    return swapRegions(document, incoming);
  } catch {
    // Offline, or a server that answered with something else: the link
    // still works, so hand the click back to the browser.
    return false;
  }
}

function wireDocument(element: HTMLElement): void {
  const root = element.ownerDocument;
  if (!root || root.documentElement.hasAttribute(INITIALIZED_ATTR)) return;
  root.documentElement.setAttribute(INITIALIZED_ATTR, '');

  root.addEventListener('click', (event) => {
    if (!isPlainActivation(event as MouseEvent)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>(
      '[data-kometio-term-list="filter"] a[href]',
    );
    if (!link || link.target) return;
    event.preventDefault();
    const href = link.href;
    void showNarrowed(href).then((swapped) => {
      if (swapped) {
        // Only once the page really changed: an address that says
        // "filtered" over a list that is not would be a lie the back
        // button then repeats.
        root.defaultView?.history.pushState({}, '', href);
      } else {
        root.defaultView?.location.assign(href);
      }
    });
  });

  // The reader's own way back. Without this the address would change and
  // the list would not — the classic broken back button of a page that
  // updates itself.
  root.defaultView?.addEventListener('popstate', () => {
    void showNarrowed(root.defaultView?.location.href ?? '').then((swapped) => {
      if (!swapped) root.defaultView?.location.reload();
    });
  });
}

export const termListBehaviors: BlockBehavior[] = [
  { selector: '[data-kometio-term-list="filter"]', wire: wireDocument },
];
