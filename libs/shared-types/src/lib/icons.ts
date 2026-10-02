import { z } from 'zod';
import { isMediaIcon } from './media-icon';

/**
 * A single icon resolved from the active theme (docs/adr/0023) — `svg` is
 * the raw markup (no file reference: editor-app and apps/public-site are
 * two separate applications and share no filesystem at runtime).
 */
export const iconEntrySchema = z.object({
  name: z.string().min(1),
  svg: z.string().min(1),
});
export type IconEntry = z.infer<typeof iconEntrySchema>;

/** Response body of `GET /api/themes/current/icons` (apps/public-site). */
export const iconManifestSchema = z.array(iconEntrySchema);
export type IconManifest = z.infer<typeof iconManifestSchema>;

/**
 * The prefix of a logo from the brand set (ADR-0053). The two sets share
 * some names (`apple`, `box`), so the prefix is what keeps a stored name
 * meaning the same picture.
 */
export const BRAND_ICON_PREFIX = 'brand:';

/**
 * Where a stored icon value comes from. Only an `interface` icon belongs
 * to the theme: the brand logos and the media-library images are the same
 * whichever theme is active, so they are the only kind a theme can lack
 * (ADR-0090).
 */
export type IconSource = 'interface' | 'brand' | 'media';

export function iconSource(value: string): IconSource {
  if (value.startsWith(BRAND_ICON_PREFIX)) return 'brand';
  if (isMediaIcon(value)) return 'media';
  return 'interface';
}
