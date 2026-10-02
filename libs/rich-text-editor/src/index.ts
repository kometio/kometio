// Re-exported for their TYPES as much as their values: each TipTap
// extension declares its commands by augmenting `@tiptap/core`, and an
// augmentation only applies where its module is part of the program. A
// consumer that calls `toggleItalic()` while importing only the array
// below gets "Property 'toggleItalic' does not exist" — so the set is
// exposed here rather than left to every app to depend on the same
// fifteen packages again.
export { default as Bold } from '@tiptap/extension-bold';
export { default as Italic } from '@tiptap/extension-italic';
export { default as Underline } from '@tiptap/extension-underline';
export { default as Strike } from '@tiptap/extension-strike';
export { default as Code } from '@tiptap/extension-code';
export { default as Link } from '@tiptap/extension-link';
export { BulletList, ListItem, OrderedList } from '@tiptap/extension-list';
export { default as Subscript } from '@tiptap/extension-subscript';
export { default as Superscript } from '@tiptap/extension-superscript';

export * from './lib/rich-text-extensions';
