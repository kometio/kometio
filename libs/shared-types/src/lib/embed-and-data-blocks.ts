import { z } from 'zod';
import { defineBlockContract } from './block-contract';
import { consentCategorySchema } from './cookie-consent';
import { asString } from './search-prose';

/**
 * `formName` is denormalized purely as the editor canvas label (docs/adr/0015)
 * — unlike `PickedMedia.url`, it is never used for rendering on the public
 * site, which live-fetches the form's current name/fields by `formId` on
 * every render instead of trusting this snapshot.
 */
export const pickedFormSchema = z.object({
  formId: z.string(),
  formName: z.string(),
});
export type PickedForm = z.infer<typeof pickedFormSchema>;

export const formBlockPropsSchema = z.object({
  form: pickedFormSchema.nullable(),
});
export type FormBlockProps = z.infer<typeof formBlockPropsSchema>;
export const formBlockContract = defineBlockContract({
  type: 'Form',
  props: formBlockPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: {
    none: "its fields are configuration, and the words of a form are not the page's",
  },
});

/**
 * `html` is sanitized before it ever reaches the DOM — confirmed with the
 * user (2026-08-19), overriding the initial "site owner writes it, skip
 * sanitization" assumption. apps/public-site's EmbedHtml.astro runs it
 * through sanitize-html with a permissive policy (script/iframe kept,
 * since that's the whole point of a free-embed block — YouTube/Calendly/
 * chat widgets are all script- or iframe-based — but any `on*` inline
 * event-handler attribute is stripped).
 *
 * `consentCategory` (docs/adr/0131) is what a visitor must have agreed to
 * before it runs: its scripts and frames are third parties', and nothing of
 * it is requested until the banner has been answered for that category.
 * Optional in what is stored — a block made before it existed has none, and
 * a stored page must keep reading — and `experience` when it is not said.
 * `necessary` is the way to say that no consent is needed.
 */
export const embedHtmlPropsSchema = z.object({
  html: z.string(),
  consentCategory: consentCategorySchema.optional(),
});
export type EmbedHtmlProps = z.infer<typeof embedHtmlPropsSchema>;
export const embedHtmlBlockContract = defineBlockContract({
  type: 'EmbedHtml',
  props: embedHtmlPropsSchema,
  // No textColor: the content is arbitrary HTML pasted by the user,
  // which often already carries its own color — only the "frame" space
  // (background/corners/padding) makes sense here.
  style: {
    backgroundColor: 'transparent',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: {
    none: 'raw markup, which would pollute the index rather than read as prose',
  },
});

export const codePropsSchema = z.object({
  code: z.string(),
  language: z.string(),
});
export type CodeProps = z.infer<typeof codePropsSchema>;
export const codeBlockContract = defineBlockContract({
  type: 'Code',
  props: codePropsSchema,
  // No textColor: the Shiki theme (github-dark) already sets the syntax
  // colors, same reason as EmbedHtml for free-form content.
  style: {
    backgroundColor: 'transparent',
    borderRadius: 'var(--radius)',
    paddingX: '1.25rem',
    paddingY: '1rem',
  },
  // The snippet itself: on a documentation site, the name of a function
  // someone read here is exactly what they come back searching for.
  search: (props) => [asString(props['code'])],
});

/**
 * `rows` is a plain matrix, first row always treated as the header
 * (`<thead>`) by both renders (table.block.tsx and Table.astro) — no
 * separate `headers` field or `hasHeader` toggle, keeping the shape as
 * simple as the hand-built "aggiungi riga/colonna" editor
 * (table-data-field.tsx) that produces it. Not required to stay
 * rectangular by the schema itself — a ragged matrix just renders a
 * ragged table (fewer `<td>`s on a short row), it can't crash the render,
 * so there is nothing to validate for at this boundary.
 */
export const tablePropsSchema = z.object({
  rows: z.array(z.array(z.string())),
});
export type TableProps = z.infer<typeof tablePropsSchema>;
export const tableBlockContract = defineBlockContract({
  type: 'Table',
  props: tablePropsSchema,
  style: {
    // These land on the cells rather than the scroll wrapper: padding and
    // borders are what "styling a table" means (see Table.astro).
    backgroundColor: 'var(--muted)',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0.75rem',
    paddingY: '0.5rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
  },
  search: (props) => {
    const rows = Array.isArray(props['rows']) ? props['rows'] : [];
    return rows.flat().map((cell) => asString(cell));
  },
});

/** Every block this file declares, in the order the picker draws them. */
export const EMBED_AND_DATA_BLOCK_CONTRACTS = [
  formBlockContract,
  embedHtmlBlockContract,
  codeBlockContract,
  tableBlockContract,
] as const;
