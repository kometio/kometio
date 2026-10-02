import type { APIRoute } from 'astro';
import { GET as optimize } from 'astro/assets/endpoint/generic';
import { mediaBaseUrls, refusedImageSource } from './lib/media-url';

/**
 * `/_image`, Astro's image optimiser, but only for this site's own media
 * (astro.config.mjs `image.endpoint`). The check is `refusedImageSource`;
 * everything else is Astro's own endpoint.
 */
export const GET: APIRoute = (context) =>
  refusedImageSource(new URL(context.request.url), mediaBaseUrls()) ??
  optimize(context);
