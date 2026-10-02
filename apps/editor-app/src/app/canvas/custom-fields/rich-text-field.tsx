import { useEffect, useState } from 'react';
import {
  Bold,
  Italic,
  Link as LinkIcon,
  Link2Off,
  List,
  ListOrdered,
  Strikethrough,
  Underline,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { buildPageLinkHref } from '@kometio/shared-types';
import { useTranslation } from 'react-i18next';
import { usePageList } from '../../pages/page-list-context';
import { PromptDialog } from '../../common/prompt-dialog';
import { RICH_TEXT_EXTENSIONS } from '@kometio/rich-text-editor';
import { IconButton } from '../../common/icon-button';

export interface RichTextFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** The id of the text that names the field — the editable area is announced by it. */
  labelledBy?: string;
}

/**
 * 28×28, and an icon rather than a letter.
 *
 * These were 20×16px buttons carrying the letters "B I U S" at 12px, plus
 * "•", "1.", "¶→", "↗" and "⊘" — under any minimum for a pointer target
 * (WCAG 2.5.8 asks 24×24), and the last three were symbols nobody could be
 * expected to read. The same lucide set the rest of the editor uses, at the
 * same 16px, in a button the same size as every other icon button on the
 * canvas.
 */
function ToolbarButton({
  editor,
  icon: Icon,
  title,
  isActive,
  onClick,
}: {
  editor: Editor;
  icon: LucideIcon;
  title: string;
  isActive?: boolean;
  onClick: () => void;
}) {
  return (
    <IconButton
      label={title}
      size="icon-sm"
      aria-pressed={isActive ?? false}
      className="text-muted-foreground"
      // The editor loses its selection to a focused button otherwise, and
      // the command then applies to nothing.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={!editor.isEditable}
    >
      <Icon />
    </IconButton>
  );
}

/**
 * The Inspector control for a `kind: 'richtext'` field (ADR-0046).
 *
 * The value is an HTML string, which is what makes per-locale translation
 * work unchanged — the overlay that carries translations maps a field to
 * a string, and this stays one.
 *
 * "Link to a page" is the reason the whole field kind exists, and it does
 * NOT write a path. It writes a reference the render step resolves in the
 * locale being read, so renaming or moving a page never breaks a link
 * written inside a sentence, and one stored value serves every language.
 */
export function RichTextField({
  value,
  onChange,
  placeholder,
  labelledBy,
}: RichTextFieldProps) {
  const { t } = useTranslation();
  const { pick } = usePageList();
  // The address being asked for, `null` while nobody is asking.
  const [linkDraft, setLinkDraft] = useState<string | null>(null);

  const editor = useEditor({
    extensions: RICH_TEXT_EXTENSIONS,
    content: value,
    onUpdate: ({ editor: current }) => {
      // An empty document is `<p></p>`, and every "has this been filled
      // in?" check in the product tests for `''`. Reporting the empty
      // string keeps required-field warnings and defaults working.
      onChange(current.isEmpty ? '' : current.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          'min-h-20 w-full rounded-b-lg border border-t-0 border-input px-2.5 py-2 text-sm outline-none focus-visible:border-ring',
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        // An editable area is not a form control, so nothing names it on
        // its own: without these a screen reader announced "editable"
        // and nothing about which field it was.
        role: 'textbox',
        'aria-multiline': 'true',
        ...(labelledBy ? { 'aria-labelledby': labelledBy } : {}),
      },
    },
  });

  // The value can change from outside this field — undo/redo, a rollback,
  // switching language. Without this the editor would keep showing what
  // it had. Guarded on inequality so typing does not reset the caret on
  // every keystroke.
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      const current = editor.isEmpty ? '' : editor.getHTML();
      if (current !== value) {
        editor.commands.setContent(value, { emitUpdate: false });
      }
    }
  }, [editor, value]);

  if (!editor) {
    return null;
  }

  async function handleLinkToPage() {
    if (!editor) return;
    const picked = await pick();
    if (!picked) return;
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: buildPageLinkHref(picked.pageGroupId) })
      .run();
  }

  function handleLinkToUrl() {
    if (!editor) return;
    const previous: unknown = editor.getAttributes('link')['href'];
    setLinkDraft(
      typeof previous === 'string' && !previous.startsWith('kometio:')
        ? previous
        : 'https://',
    );
  }

  function applyLink(url: string) {
    if (!editor) return;
    const chain = editor.chain().focus().extendMarkRange('link');
    (url === '' ? chain.unsetLink() : chain.setLink({ href: url })).run();
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-0.5 rounded-t-lg border border-input bg-muted/40 p-1">
        <ToolbarButton
          editor={editor}
          icon={Bold}
          title={t('canvas.richText.bold')}
          isActive={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          editor={editor}
          icon={Italic}
          title={t('canvas.richText.italic')}
          isActive={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          editor={editor}
          icon={Underline}
          title={t('canvas.richText.underline')}
          isActive={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ToolbarButton
          editor={editor}
          icon={Strikethrough}
          title={t('canvas.richText.strike')}
          isActive={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <span className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton
          editor={editor}
          icon={List}
          title={t('canvas.richText.bulletList')}
          isActive={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          editor={editor}
          icon={ListOrdered}
          title={t('canvas.richText.orderedList')}
          isActive={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <span className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton
          editor={editor}
          icon={LinkIcon}
          title={t('canvas.richText.linkToPage')}
          isActive={editor.isActive('link')}
          onClick={() => void handleLinkToPage()}
        />
        <ToolbarButton
          editor={editor}
          icon={ExternalLink}
          title={t('canvas.richText.linkToUrl')}
          onClick={handleLinkToUrl}
        />
        <ToolbarButton
          editor={editor}
          icon={Link2Off}
          title={t('canvas.richText.unlink')}
          onClick={() => editor.chain().focus().unsetLink().run()}
        />
      </div>
      <EditorContent editor={editor} />
      {/* An empty address removes the link, as it did in the browser's
          prompt this replaces. */}
      <PromptDialog
        open={linkDraft !== null}
        onOpenChange={(open) => {
          if (!open) setLinkDraft(null);
        }}
        title={t('canvas.richText.linkToUrl')}
        label={t('canvas.richText.urlPrompt')}
        initialValue={linkDraft ?? ''}
        type="url"
        required={false}
        submitLabel={t('canvas.richText.applyLink')}
        onSubmit={applyLink}
      />
    </div>
  );
}
