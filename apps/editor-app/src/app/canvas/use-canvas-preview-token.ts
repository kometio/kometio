import { useEffect, useState } from 'react';
import {
  createReusableSectionPreviewToken,
  createTranslationPreviewToken,
} from '../../lib/preview-token-api-client';

/**
 * The token the shell's own requests to the preview carry — fragment
 * re-renders while editing, and the "Preview" button's new tab.
 *
 * A separate token from the one canvas-frame.tsx mints for its own `src`:
 * minting is non-consuming (see PreviewTokenPort), so a second one is
 * cheap and CanvasFrame's already-tested interface does not have to expose
 * its own upwards.
 *
 * `null` until the first one arrives. A token that lands after the page
 * has changed is dropped rather than applied: it was minted for the page
 * being left.
 */
export function useCanvasPreviewToken(
  pageId: string,
  sectionPreview: { sectionId: string; locale: string } | undefined,
): string | null {
  const [token, setToken] = useState<string | null>(null);
  // The id, not the object. The section editor passes `sectionPreview` as
  // an object literal, a new one on every render, and depending on the
  // object asked the API for a fresh token each time the editor re-rendered
  // — every save-status change. Only the id decides which token is needed.
  const sectionId = sectionPreview?.sectionId;
  useEffect(() => {
    let cancelled = false;
    // A section's fragments are authorised by a SECTION token: the
    // endpoint validates one or the other and never both (docs/adr/0059).
    const minted = sectionId
      ? createReusableSectionPreviewToken(sectionId)
      : createTranslationPreviewToken(pageId);
    minted
      .then((preview) => {
        if (!cancelled) {
          setToken(preview.token);
        }
      })
      // Refused (a session that has expired, the network gone): the token
      // stays `null`, and CanvasFrame — which asks for its own — is what
      // tells the person. Left uncaught, it was an unhandled rejection in
      // the console on every failure.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pageId, sectionId]);
  return token;
}
