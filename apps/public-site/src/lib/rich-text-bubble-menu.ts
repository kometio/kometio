import type { Editor } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import {
  buildPageLinkHref,
  type RichTextMenuLabels,
} from '@kometio/shared-types';

export interface RichTextBubbleMenu {
  /** Re-reads the editor state and shows, hides or moves the menu. */
  refresh: () => void;
  destroy: () => void;
}

interface ButtonSpec {
  label: string;
  title: string;
  isActive?: () => boolean;
  run: () => void;
}

const MENU_ID = 'kometio-rich-text-menu';

/**
 * The answer to "link to a page": the page group the editor's picker
 * returned, put on the selection the field kept alive while it asked.
 * `null` is a picker that was dismissed, and leaves the text as it was.
 */
export function applyPageLink(
  editor: Editor,
  pageGroupId: string | null,
): void {
  const chain = editor.chain().focus();
  if (pageGroupId !== null) {
    chain
      .extendMarkRange('link')
      .setLink({ href: buildPageLinkHref(pageGroupId) });
  }
  chain.run();
}

/**
 * The formatting menu that appears over a selection while a rich text
 * field is being edited on the canvas.
 *
 * Built by hand rather than with `@tiptap/extension-bubble-menu`, for one
 * reason that decides it: this runs inside the preview iframe, which is a
 * rendered SITE carrying the theme's own CSS. A menu that inherited it
 * would look different on every theme, and could be made unreadable by
 * one. Every declaration below is set explicitly on the element, and the
 * container opts out of inheritance with `all: initial`.
 *
 * It is appended to `body`, outside every block element, which is what
 * keeps the bridge from mistaking it for content: block collection looks
 * for `[data-kometio-block-id]` and the click handler for the nearest one,
 * and the menu is under neither.
 */
export function createRichTextBubbleMenu(
  doc: Document,
  editor: Editor,
  labels: RichTextMenuLabels,
  onRequestPageLink: () => void,
): RichTextBubbleMenu {
  const menu = doc.createElement('div');
  menu.id = MENU_ID;
  menu.setAttribute('role', 'toolbar');
  menu.style.cssText = [
    'all: initial',
    'position: absolute',
    'z-index: 2147483647',
    'display: none',
    'gap: 2px',
    'padding: 4px',
    'border-radius: 8px',
    'background: #1f2430',
    'box-shadow: 0 6px 20px rgba(0,0,0,.35)',
    'font-family: system-ui, sans-serif',
  ].join(';');

  const buttons: ButtonSpec[] = [
    {
      label: 'B',
      title: labels.bold,
      isActive: () => editor.isActive('bold'),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: 'I',
      title: labels.italic,
      isActive: () => editor.isActive('italic'),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: 'U',
      title: labels.underline,
      isActive: () => editor.isActive('underline'),
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      label: 'S',
      title: labels.strike,
      isActive: () => editor.isActive('strike'),
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      label: '•',
      title: labels.bulletList,
      isActive: () => editor.isActive('bulletList'),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: '1.',
      title: labels.orderedList,
      isActive: () => editor.isActive('orderedList'),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    { label: '¶→', title: labels.linkToPage, run: onRequestPageLink },
    {
      label: '↗',
      title: labels.linkToUrl,
      run: () => {
        const previous: unknown = editor.getAttributes('link')['href'];
        const url = doc.defaultView?.prompt(
          labels.urlPrompt,
          typeof previous === 'string' && !previous.startsWith('kometio:')
            ? previous
            : 'https://',
        );
        if (url === null || url === undefined) {
          return;
        }
        const chain = editor.chain().focus().extendMarkRange('link');
        (url === '' ? chain.unsetLink() : chain.setLink({ href: url })).run();
      },
    },
    {
      label: '⊘',
      title: labels.unlink,
      isActive: () => editor.isActive('link'),
      run: () => editor.chain().focus().unsetLink().run(),
    },
  ];

  const rendered = buttons.map((spec) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = spec.label;
    button.title = spec.title;
    button.setAttribute('aria-label', spec.title);
    button.style.cssText = [
      'all: initial',
      'cursor: pointer',
      'min-width: 24px',
      'padding: 4px 6px',
      'border-radius: 5px',
      'color: #e6e8ee',
      'font: 500 12px/1 system-ui, sans-serif',
      'text-align: center',
    ].join(';');
    // Without this the editor loses its selection the moment a button
    // takes focus, and the command then applies to nothing — the same
    // reason the Inspector's toolbar does it.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => spec.run());
    menu.append(button);
    return { spec, button };
  });

  doc.body.append(menu);

  function refresh(): void {
    const { state } = editor.view;
    const hasSelection = !state.selection.empty;
    if (!hasSelection || !editor.isEditable) {
      menu.style.display = 'none';
      return;
    }
    for (const { spec, button } of rendered) {
      const active = spec.isActive?.() ?? false;
      button.style.background = active ? '#3b82f6' : 'transparent';
    }
    menu.style.display = 'flex';
    position(state);
  }

  /**
   * Separate from deciding whether to show the menu, and allowed to fail.
   *
   * `coordsAtPos` reads real layout, and it throws where there is none —
   * a detached node mid-reflow, or a selection the view has not measured
   * yet. This runs from `onSelectionUpdate`, so an exception escaping it
   * would break typing in the field, which is a far worse outcome than a
   * menu that stays where it was for one keystroke.
   */
  function position(state: EditorState): void {
    let start: { left: number; right: number; top: number; bottom: number };
    let end: typeof start;
    try {
      start = editor.view.coordsAtPos(state.selection.from);
      end = editor.view.coordsAtPos(state.selection.to);
    } catch {
      return;
    }
    const view = doc.defaultView;
    const scrollX = view?.scrollX ?? 0;
    const scrollY = view?.scrollY ?? 0;
    const centre =
      (Math.min(start.left, end.left) + Math.max(start.right, end.right)) / 2;
    const top = Math.min(start.top, end.top) + scrollY - menu.offsetHeight - 8;
    menu.style.left = `${Math.max(8, centre + scrollX - menu.offsetWidth / 2)}px`;
    // Below the selection instead when there is no room above it, rather
    // than off the top of the document where it cannot be reached.
    menu.style.top =
      top < scrollY
        ? `${Math.max(start.bottom, end.bottom) + scrollY + 8}px`
        : `${top}px`;
  }

  return {
    refresh,
    destroy: () => menu.remove(),
  };
}
