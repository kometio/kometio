import { editorAppUrl } from './editor-app-url';

// The same reason as renderBlockFragmentCorsHeaders
// (render-block-fragment-helpers.ts): editor-app (apps/editor-app) runs on
// a different origin in dev and has to be able to read these GET responses.
// No token here — both the icon manifest (docs/adr/0023) and the per-block
// style defaults (docs/adr/0022) are public in the same sense as the rest
// of public-pages, with no user data involved. Shared by every endpoint
// under `/api/themes/current/*` rather than one file per endpoint: same
// rules, same reason, nothing specific to duplicate.
export function themesApiCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': editorAppUrl(),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
}
