import { publicSiteUrl } from './runtime-config';

// Not the API's address: this is the public site's own origin
// (apps/public-site), where both the "Visualizza pagina" link and the
// preview canvas iframe (canvas-frame.tsx) point. Same runtime-then-build
// lookup as the API's, and the same loud failure when neither is set.
export const PUBLIC_SITE_URL = publicSiteUrl();
