import { z } from 'zod';
import { request } from './http-client';

const previewTokenSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
});

export type PreviewTokenDto = z.infer<typeof previewTokenSchema>;

/** See POST /reusable-sections/:id/preview-token — the same mechanism, for the section editor's own canvas (docs/adr/0059). */
export async function createReusableSectionPreviewToken(
  sectionId: string,
): Promise<PreviewTokenDto> {
  return previewTokenSchema.parse(
    await request(`/reusable-sections/${sectionId}/preview-token`, {
      method: 'POST',
    }),
  );
}

/** See POST /page-groups/translations/:id/preview-token — field-level i18n, the same mechanism scoped to ONE translation rather than to the old Page. */
export async function createTranslationPreviewToken(
  translationId: string,
): Promise<PreviewTokenDto> {
  return previewTokenSchema.parse(
    await request(`/page-groups/translations/${translationId}/preview-token`, {
      method: 'POST',
    }),
  );
}
