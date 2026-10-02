import { z } from 'zod';
import {
  THEME_UPLOAD_FAILURES,
  themeUploadStatusSchema,
  type ThemeUploadFailure,
  type ThemeUploadStatus,
} from '@kometio/shared-types';
import { ApiError, request } from './http-client';

export type { ThemeUploadStatus };

const settingsSchema = z.object({ enabled: z.boolean() });

/**
 * Whether this deployment takes uploaded themes (docs/adr/0091). Asked by
 * every editor that opens the Style dialog, but answered only to admins:
 * for anybody else the route refuses, which here means "not for you".
 */
export async function getThemeUploadSettings(): Promise<{ enabled: boolean }> {
  try {
    return settingsSchema.parse(await request('/themes/uploads/settings'));
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return { enabled: false };
    }
    throw error;
  }
}

export async function uploadTheme(file: File): Promise<ThemeUploadStatus> {
  const body = new FormData();
  body.append('file', file);
  return themeUploadStatusSchema.parse(
    await request('/themes/uploads', { method: 'POST', body }),
  );
}

export async function getThemeUpload(id: string): Promise<ThemeUploadStatus> {
  return themeUploadStatusSchema.parse(await request(`/themes/uploads/${id}`));
}

/**
 * Why the API refused an upload, when it said: the reason's code is the
 * whole message (ThemeUploadRejectedError), and too big is a 413 that
 * never reached it.
 */
export function refusedUploadFailure(
  error: unknown,
): ThemeUploadFailure | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 413) return 'too-large';
  const message = error.displayMessage;
  return THEME_UPLOAD_FAILURES.find((failure) => failure === message) ?? null;
}
