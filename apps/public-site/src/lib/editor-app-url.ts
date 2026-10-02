import { requireEnv } from '@kometio/env-config';

// process.env, not import.meta.env: read at request time (SSR, Node) rather
// than at build time — the same reason as API_URL in public-api-client.ts.
// The origin authorized both for the preview route's CSP frame-ancestors
// header and for render-block-fragment.ts's CORS (both gated by the preview
// token, not by this value — it is only "who may embed or call"; the real
// authentication stays the token).
export function editorAppUrl(): string {
  return requireEnv('EDITOR_APP_URL');
}
