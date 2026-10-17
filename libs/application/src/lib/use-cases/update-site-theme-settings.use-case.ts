import { InvalidUploadedFontError, type Site } from '@kometio/domain-core';
import type {
  MediaRepositoryPort,
  MediaStoragePort,
  SiteRepositoryPort,
} from '@kometio/ports';
import {
  WEB_FONT_MIME_TYPES,
  detectKnownTrackers,
  type ThemeSettings,
  type TrackerScriptEntry,
  type TrackerScriptPlacement,
  type UploadedFont,
} from '@kometio/shared-types';
import { requireSite } from './require-site';

export interface UpdateSiteThemeSettingsDeps {
  siteRepository: SiteRepositoryPort;
  mediaRepository: Pick<MediaRepositoryPort, 'findById'>;
  mediaStorage: Pick<MediaStoragePort, 'getUrl'>;
}

export interface UpdateSiteThemeSettingsInput extends ThemeSettings {
  tenantId: string;
  siteId: string;
}

function extractKnownTrackers(
  html: string | null,
  placement: TrackerScriptPlacement,
): { remainingScript: string | null; extracted: TrackerScriptEntry[] } {
  const { detected, remainingHtml } = detectKnownTrackers(html ?? '');
  return {
    remainingScript: remainingHtml || null,
    extracted: detected.map((tracker) => ({
      id: crypto.randomUUID(),
      label: tracker.vendor,
      category: tracker.category,
      placement,
      html: tracker.html,
    })),
  };
}

/**
 * The uploaded font as it is kept (docs/adr/0147): every file one of this
 * site's own, a web font, and at the address the library serves it from.
 *
 * The address is set here and not taken from the request. The public site
 * fetches it to serve the font from its own origin, so an address a client
 * chose would be one more thing that server could be told to fetch.
 */
async function servedUploadedFont(
  deps: UpdateSiteThemeSettingsDeps,
  tenantId: string,
  siteId: string,
  font: UploadedFont | null,
): Promise<UploadedFont | null> {
  if (font === null) return null;
  const faces = await Promise.all(
    font.faces.map(async (face) => {
      const media = await deps.mediaRepository.findById(tenantId, face.mediaId);
      if (!media || media.siteId !== siteId) {
        throw new InvalidUploadedFontError(
          "one of its files is not in this site's library",
        );
      }
      if (!WEB_FONT_MIME_TYPES.includes(media.mimeType)) {
        throw new InvalidUploadedFontError(
          'one of its files is not a WOFF2 or WOFF font',
        );
      }
      return { ...face, url: deps.mediaStorage.getUrl(media.storageKey) };
    }),
  );
  return { family: font.family, faces };
}

/**
 * Runs the signature detector (docs/adr/0039) on every save: a known
 * vendor (GTM/GA4/Meta Pixel) pasted into the legacy free-text
 * headScript/bodyScript fields is automatically moved into the
 * categorized `trackerScripts` list instead of staying an always-on,
 * ungated blob — the user asked for this to happen "on its own", not via
 * a manual migration step.
 */
export async function updateSiteThemeSettings(
  deps: UpdateSiteThemeSettingsDeps,
  input: UpdateSiteThemeSettingsInput,
): Promise<Site> {
  const site = await requireSite(
    deps.siteRepository,
    input.tenantId,
    input.siteId,
  );

  const uploadedFont = await servedUploadedFont(
    deps,
    input.tenantId,
    input.siteId,
    input.uploadedFont,
  );
  if (input.fontFamily === 'uploaded' && uploadedFont === null) {
    throw new InvalidUploadedFontError('no font has been uploaded');
  }

  const head = extractKnownTrackers(input.headScript, 'head');
  const body = extractKnownTrackers(input.bodyScript, 'body');

  site.updateThemeSettings({
    primaryColor: input.primaryColor,
    secondaryColor: input.secondaryColor,
    fontFamily: input.fontFamily,
    customCss: input.customCss,
    contentWidth: input.contentWidth,
    headScript: head.remainingScript,
    bodyScript: body.remainingScript,
    faviconUrl: input.faviconUrl,
    uploadedFont,
    overridesEnabled: input.overridesEnabled,
    motionEnabled: input.motionEnabled,
    allowedTrackerDomains: input.allowedTrackerDomains,
    trackerScripts: [
      ...input.trackerScripts,
      ...head.extracted,
      ...body.extracted,
    ],
  });
  await deps.siteRepository.save(site);

  return site;
}
