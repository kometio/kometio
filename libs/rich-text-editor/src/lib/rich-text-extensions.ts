import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import HardBreak from '@tiptap/extension-hard-break';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Underline from '@tiptap/extension-underline';
import Strike from '@tiptap/extension-strike';
import Code from '@tiptap/extension-code';
import Link from '@tiptap/extension-link';
import {
  BulletList,
  ListItem,
  ListKeymap,
  OrderedList,
} from '@tiptap/extension-list';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { UndoRedo } from '@tiptap/extensions';
import { KOMETIO_PAGE_LINK_SCHEME } from '@kometio/shared-types';

/**
 * What the rich text editor can produce, and deliberately the SAME set
 * `sanitizeRichText` lets through (`@kometio/rich-text`, ADR-0046).
 *
 * Listed one by one rather than taken from StarterKit, so the set is
 * readable next to the allowlist it has to match. StarterKit would bring
 * headings, blockquotes, code blocks and horizontal rules and leave four
 * `false`s to say what is NOT here — those are BLOCKS in this product,
 * with their own descriptors and their own place in the Layers panel, and
 * a body-text field is not where they belong.
 *
 * The agreement matters more than the contents: offer a button, let
 * someone style a line, then drop it on save and the work is gone with no
 * error anywhere. `rich-text-extensions.spec.ts` asserts the two sets
 * still match, so neither can drift alone.
 */
export const RICH_TEXT_EXTENSIONS = [
  Document,
  Paragraph,
  Text,
  HardBreak,
  Bold,
  Italic,
  Underline,
  Strike,
  Code,
  Subscript,
  Superscript,
  BulletList,
  OrderedList,
  ListItem,
  // Enter/Backspace behaving as people expect inside a list. Not
  // formatting, just the absence of a papercut.
  ListKeymap,
  // Undo INSIDE the field. The page's own history (Cmd+Z on the canvas)
  // works at the granularity of a debounce burst and would swallow a
  // whole run of typing; here it is the ordinary text-editing undo.
  UndoRedo,
  Link.configure({
    openOnClick: false,
    // Matches the sanitiser exactly. `kometio` carries an internal page
    // reference that render swaps for the real path in the locale being
    // read — it never reaches a browser.
    protocols: ['http', 'https', 'mailto', KOMETIO_PAGE_LINK_SCHEME],
    HTMLAttributes: { rel: null, target: null },
  }),
];
