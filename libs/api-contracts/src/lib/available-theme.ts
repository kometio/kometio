import { z } from 'zod';

/**
 * `GET /sites/themes/available`'s response shape (docs/adr/0042) — every
 * theme this deployment's image actually bundled, read at request time
 * from `ThemeCatalogPort`. Shared between apps/api's SitesController and
 * apps/editor-app's sites-api-client.ts, same reasoning as siteRecordSchema.
 */
export const availableThemeSchema = z.object({
  name: z.string(),
  /** Uploaded from the editor (docs/adr/0091) rather than shipped with Kometio. */
  uploaded: z.boolean(),
});

export type AvailableTheme = z.infer<typeof availableThemeSchema>;

export const availableThemesResponseSchema = z.array(availableThemeSchema);
