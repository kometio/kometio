import { z } from 'zod';

/*
 * A theme uploaded from the editor, from the moment it arrives to the
 * moment the site runs on it (docs/adr/0091). The API writes the first
 * status, the theme builder every one after, and the editor reads them to
 * show where the upload has got to.
 */

export const THEME_UPLOAD_STATES = [
  /** Waiting for the builder, which builds one theme at a time. */
  'queued',
  'building',
  /** The site runs on a build that has it: it can be chosen now. */
  'published',
  'failed',
] as const;

/**
 * Why an upload failed, for the editor to say in its own language. The
 * archive's own problems come first (`@kometio/theme-archive`), then what
 * can go wrong after it is accepted.
 */
export const THEME_UPLOAD_FAILURES = [
  'not-a-zip',
  'too-large',
  'too-many-entries',
  'unsafe-path',
  'link',
  'encrypted',
  'no-manifest',
  'bad-manifest',
  'bad-name',
  'no-stylesheet',
  /** The name of one of Kometio's own themes, which it would replace for every site. */
  'core-name',
  /** The site did not build with it: its log says why. */
  'build-failed',
  /** The builder stopped in the middle — restarted or out of time. */
  'interrupted',
] as const;

export const themeUploadStatusSchema = z.object({
  id: z.string(),
  /** From the theme's `theme.json`; `null` until the archive is read. */
  name: z.string().nullable(),
  state: z.enum(THEME_UPLOAD_STATES),
  failure: z.enum(THEME_UPLOAD_FAILURES).nullable(),
  /** The end of the build's output, when the build is what failed. */
  log: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ThemeUploadStatus = z.infer<typeof themeUploadStatusSchema>;
export type ThemeUploadFailure = (typeof THEME_UPLOAD_FAILURES)[number];
