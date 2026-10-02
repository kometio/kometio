import { describe, expect, it } from 'vitest';
import { sanitizeRichText } from '@kometio/rich-text';
import { Editor } from '@tiptap/core';
import { RICH_TEXT_EXTENSIONS } from './rich-text-extensions';

/** Every tag the editor's schema can put in the document. */
function tagsTheEditorCanProduce(): string[] {
  const editor = new Editor({ extensions: RICH_TEXT_EXTENSIONS });
  const schema = editor.schema;
  const tags = new Set<string>();
  for (const spec of [
    ...Object.values(schema.nodes),
    ...Object.values(schema.marks),
  ]) {
    for (const rule of spec.spec.parseDOM ?? []) {
      if (typeof rule.tag === 'string') {
        tags.add(rule.tag.split(/[[ .]/)[0].toLowerCase());
      }
    }
  }
  editor.destroy();
  return [...tags].filter((tag) => tag && tag !== 'doc');
}

describe('the editor and the sanitiser agree on what rich text is', () => {
  // If they drift, the product lies: a button formats something, or an
  // import brings something in, and the save silently drops it. No error,
  // no warning — the work is just gone, which is this codebase's most
  // familiar shape of bug.
  //
  // "Survives" and not "comes back identical": the sanitiser normalises
  // synonyms (`del`/`strike` to `s`, `b` to `strong`), which keeps the
  // meaning while leaving one shape in the database. What must never
  // happen is a tag reduced to bare text.
  it('understands nothing whose meaning the sanitiser would throw away', () => {
    const flattened = tagsTheEditorCanProduce().filter((tag) => {
      const sanitised = sanitizeRichText(`<${tag}>x</${tag}>`);
      return !/<[a-z]/i.test(sanitised);
    });

    expect(flattened).toEqual([]);
  });

  it('offers no heading, blockquote, code block or rule — those are blocks', () => {
    const editor = new Editor({ extensions: RICH_TEXT_EXTENSIONS });
    for (const name of [
      'heading',
      'blockquote',
      'codeBlock',
      'horizontalRule',
    ]) {
      expect(editor.schema.nodes[name], name).toBeUndefined();
    }
    editor.destroy();
  });

  it('does offer a link, which is what the whole field kind exists for', () => {
    const editor = new Editor({ extensions: RICH_TEXT_EXTENSIONS });
    expect(editor.schema.marks['link']).toBeDefined();
    editor.destroy();
  });
});
