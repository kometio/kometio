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
 * A button that copies `data-kometio-copy-text` — a discount code, this
 * page's address.
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
    const copied = await copyText(button.dataset['kometioCopyText'] ?? '', doc);
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

// Shared by PromoCode and ShareButtons — registered under both types in
// block-behavior-registry.ts, the way VideoEmbed and MapEmbed share the
// consent gate's.
export const copyButtonBehaviors: BlockBehavior[] = [
  { selector: '[data-kometio-copy-text]', wire: wireCopyButton },
];
