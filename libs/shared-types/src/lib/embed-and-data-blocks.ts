import { z } from 'zod';

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

/**
 * `html` is sanitized before it ever reaches the DOM — confirmed with the
 * user (2026-08-19), overriding the initial "site owner writes it, skip
 * sanitization" assumption. apps/public-site's EmbedHtml.astro runs it
 * through sanitize-html with a permissive policy (script/iframe kept,
 * since that's the whole point of a free-embed block — YouTube/Calendly/
 * chat widgets are all script- or iframe-based — but any `on*` inline
 * event-handler attribute is stripped).
 */
export const embedHtmlPropsSchema = z.object({
  html: z.string(),
});
export type EmbedHtmlProps = z.infer<typeof embedHtmlPropsSchema>;

export const codePropsSchema = z.object({
  code: z.string(),
  language: z.string(),
});
export type CodeProps = z.infer<typeof codePropsSchema>;

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
