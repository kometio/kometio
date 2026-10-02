import type { BlockBehavior } from './types';

/**
 * Click a picture, see it full size (ADR-0057).
 *
 * One behaviour for every block that offers it — Image and Gallery today
 * — rather than one per block: the two would have been the same forty
 * lines twice, which is the mistake ADR-0052 had to undo for the two
 * sliders.
 *
 * Progressive enhancement, like every other behaviour here: without JS
 * the picture is still a picture, and nothing is announced that cannot
 * be used.
 */
const INITIALIZED_ATTR = 'data-kometio-lightbox-initialized';
const OVERLAY_CLASS = 'kometio-lightbox';

/**
 * Elements that can hold focus, for the trap below. Deliberately short:
 * the overlay contains a close button and an image, and enumerating the
 * whole focusable universe would be answering a question this dialog
 * does not ask.
 */
function focusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button, [href], [tabindex]')];
}

function openLightbox(src: string, alt: string, closeLabel: string): void {
  const overlay = document.createElement('div');
  overlay.className = OVERLAY_CLASS;
  // `dialog` + `aria-modal`: a screen reader should treat what is behind
  // this as unavailable, which is also what the focus trap enforces for
  // the keyboard.
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', alt || closeLabel);

  const image = document.createElement('img');
  image.className = 'kometio-lightbox__image';
  image.src = src;
  // The full-size view repeats a picture the page already described, so
  // it adds nothing for a screen reader — the dialog itself carries the
  // name above.
  image.alt = '';

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'kometio-lightbox__close';
  close.setAttribute('aria-label', closeLabel);
  close.textContent = '✕';

  overlay.append(image, close);
  document.body.appendChild(overlay);
  // Nothing behind the overlay should scroll while it is open — the
  // classic defect of a hand-rolled lightbox.
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const previouslyFocused = document.activeElement;
  close.focus();

  const dismiss = () => {
    overlay.remove();
    document.body.style.overflow = previousOverflow;
    document.removeEventListener('keydown', onKeyDown);
    // Focus goes back where it came from, or the reader is left at the
    // top of the document with no idea what happened.
    if (previouslyFocused instanceof HTMLElement) {
      previouslyFocused.focus();
    }
  };

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      dismiss();
      return;
    }
    if (event.key !== 'Tab') return;
    // The trap: with one focusable element, Tab has nowhere to go and
    // must stay put rather than escaping to the page behind.
    const targets = focusable(overlay);
    const first = targets[0];
    const last = targets[targets.length - 1];
    if (first === undefined || last === undefined) return;
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  close.addEventListener('click', dismiss);
  overlay.addEventListener('click', (event) => {
    // Clicking the backdrop closes; clicking the picture does not.
    if (event.target === overlay) dismiss();
  });
  document.addEventListener('keydown', onKeyDown);
}

function wireLightbox(root: HTMLElement): void {
  if (root.hasAttribute(INITIALIZED_ATTR)) return;
  root.setAttribute(INITIALIZED_ATTR, '');

  const closeLabel = root.dataset.kometioLightboxClose ?? 'Close';
  for (const trigger of root.querySelectorAll<HTMLElement>(
    '[data-kometio-lightbox-src]',
  )) {
    // A real button, not a click handler on an image: it has to be
    // reachable by keyboard and announced as something that does
    // something. The markup provides it; this only wires it up.
    trigger.addEventListener('click', () => {
      const src = trigger.dataset.kometioLightboxSrc;
      if (src) {
        openLightbox(src, trigger.dataset.kometioLightboxAlt ?? '', closeLabel);
      }
    });
  }
}

export const lightboxBehaviors: BlockBehavior[] = [
  { selector: '[data-kometio-lightbox]', wire: wireLightbox },
];
