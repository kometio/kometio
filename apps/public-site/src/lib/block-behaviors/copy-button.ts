import { runBlockBehaviors } from './run-block-behaviors';
import type { BlockBehavior } from './types';

// One listener per button, however many times behaviours re-run on it.
const INITIALIZED_ATTR = 'data-kometio-copy-initialized';
/** How long "Copied" stays on the button before its own label returns. */
const CONFIRMATION_MS = 2000;

/**
 * Puts text on the clipboard, with the old route for a page that is not
 * served over HTTPS — `navigator.clipboard` exists only in a secure
 * context, and a site previewed on a LAN address is not one.
 */
async function copyText(text: string, doc: Document): Promise<boolean> {
  const clipboard = doc.defaultView?.navigator.clipboard;
  if (clipboard && doc.defaultView?.isSecureContext) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Refused (a permissions policy, an unfocused document): try the old way.
    }
  }
  const field = doc.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  doc.body.append(field);
  field.select();
  try {
    // Deprecated and still the only thing that works outside a secure
    // context; its boolean is the honest answer to whether it did.
    return doc.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

/**
 * What a button copies: `data-kometio-copy-text` as it is — a discount code,
 * this page's address — or the text of the nearest element a
 * `data-kometio-copy-from` selector finds, looking outwards from the
 * button. The second is for a block whose text is already on the page (a
 * code sample): saying it twice would double what a visitor downloads for
 * it.
 */
function textToCopy(button: HTMLElement): string {
  const literal = button.dataset['kometioCopyText'];
  if (literal !== undefined) return literal;
  const selector = button.dataset['kometioCopyFrom'];
  if (!selector) return '';
  for (let scope = button.parentElement; scope; scope = scope.parentElement) {
    const source = scope.querySelector(selector);
    if (source) return source.textContent ?? '';
  }
  return '';
}

/**
 * A button that copies something — see `textToCopy`.
 *
 * The confirmation is said twice on purpose: on the button, for the eye,
 * and in a live region beside it, because a screen reader does not
 * announce a change to the label of the button it is already on.
 */
function wireCopyButton(button: HTMLElement): void {
  if (button.hasAttribute(INITIALIZED_ATTR)) return;
  button.setAttribute(INITIALIZED_ATTR, '');
  const doc = button.ownerDocument;
  const label =
    button.querySelector<HTMLElement>('[data-kometio-copy-label]') ?? button;
  const idleText = label.textContent ?? '';

  const status = doc.createElement('span');
  status.className = 'kometio-visually-hidden';
  status.setAttribute('aria-live', 'polite');
  button.insertAdjacentElement('afterend', status);

  let timer: ReturnType<typeof setTimeout> | undefined;
  button.addEventListener('click', async () => {
    const copied = await copyText(textToCopy(button), doc);
    const message = copied
      ? button.dataset['kometioCopiedLabel']
      : button.dataset['kometioCopyFailedLabel'];
    if (!message) return;
    label.textContent = message;
    status.textContent = message;
    clearTimeout(timer);
    timer = setTimeout(() => {
      label.textContent = idleText;
      status.textContent = '';
    }, CONFIRMATION_MS);
  });
}

// A button is anything that carries one of these, whichever block wrote it:
// PromoCode, ShareButtons, the Code block, a theme's override of any of them.
// The page wires them all (`initCopyButtons`, from PublicPageContent), and the
// registry re-runs it for a block inserted live in the canvas.
export const copyButtonBehaviors: BlockBehavior[] = [
  {
    selector: '[data-kometio-copy-text], [data-kometio-copy-from]',
    wire: wireCopyButton,
  },
];

/**
 * Wires every copy button under `root`.
 *
 * Once for the page, not once per block: a theme's override of a block has
 * no way to import this (a theme imports only the packages a theme is
 * allowed, and one that lives outside the repository must stand alone), so
 * it emits the markup and the page does the rest.
 */
export function initCopyButtons(root: ParentNode = document): void {
  runBlockBehaviors(root, copyButtonBehaviors);
}
