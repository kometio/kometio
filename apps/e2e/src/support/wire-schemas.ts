import { z } from 'zod';

/**
 * The API's answers, as far as this suite reads them — and no further.
 *
 * Not the schemas in @kometio/shared-types, on purpose: this suite looks at
 * the stack from outside, the way the editor's browser does, and pulling
 * that package in would load half the workspace into the test runner (its
 * barrel reaches theme-runtime's JSON imports, which Node's ESM loader
 * refuses without an import attribute). Listing only the fields a test
 * reads also keeps a field the suite does not care about from failing it.
 */
export interface Block {
  id?: string;
  type: string;
  props: Record<string, unknown>;
  children?: Block[];
}

export const blockSchema: z.ZodType<Block> = z.lazy(() =>
  z.object({
    id: z.string().optional(),
    type: z.string(),
    props: z.record(z.string(), z.unknown()),
    children: z.array(blockSchema).optional(),
  }),
);

export const siteSchema = z.object({
  id: z.string(),
  defaultLocale: z.string(),
  themeName: z.string(),
});

/**
 * The part of a site that Style, and Settings → Integrations, save together:
 * the record names them `theme…`, the save names them without the prefix, and
 * a save replaces the whole object, so changing one means sending back the
 * rest as they were.
 */
export const siteThemeSettingsSchema = z.object({
  themePrimaryColor: z.string().nullable(),
  themeSecondaryColor: z.string().nullable(),
  themeFontFamily: z.string().nullable(),
  themeCustomCss: z.string().nullable(),
  themeContentWidth: z.string().nullable(),
  themeHeadScript: z.string().nullable(),
  themeBodyScript: z.string().nullable(),
  themeFaviconUrl: z.string().nullable(),
  themeOverridesEnabled: z.boolean(),
  themeMotionEnabled: z.boolean(),
  themeAllowedTrackerDomains: z.array(z.unknown()),
  themeTrackerScripts: z.array(z.unknown()),
});

export const pageGroupSchema = z.object({
  id: z.string(),
  content: z.array(blockSchema),
});

export const pageTranslationSchema = z.object({
  id: z.string(),
  pageGroupId: z.string(),
  locale: z.string(),
  slug: z.string(),
  status: z.string(),
  fieldValues: z.record(z.string(), z.unknown()),
  /** When it is to be published by itself (docs/adr/0135), as an ISO instant. */
  scheduledPublishAt: z.string().nullable(),
});

export interface FormField {
  id: string;
  label: string;
  type: 'text' | 'email' | 'textarea' | 'checkbox' | 'select';
  required: boolean;
  options?: string[];
  showWhen?: { fieldId: string; equals: string | null } | null;
}

export const formSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const mediaSchema = z.object({
  id: z.string(),
  filename: z.string(),
  url: z.string(),
});

export const taxonomySchema = z.object({
  id: z.string(),
});

export const termSchema = z.object({
  id: z.string(),
});

export const submissionSchema = z.object({
  id: z.string(),
  payload: z.record(z.string(), z.unknown()),
});

export const layoutSectionSchema = z.object({
  id: z.string(),
  content: z.array(blockSchema),
});

export const layoutSectionVersionSchema = z.object({
  id: z.string(),
  content: z.array(blockSchema),
  createdAt: z.string(),
});

/** The signed-in person's own profile, as far as the suite reads it: the language the editor speaks to them in. */
export const accountProfileSchema = z.object({
  language: z.string().nullable(),
});

export const redirectSchema = z.object({
  id: z.string(),
  from: z.string(),
  kind: z.string(),
  status: z.number(),
  hits: z.number(),
  target: z
    .object({ kind: z.string(), path: z.string().nullable().optional() })
    .passthrough()
    .nullable(),
});
