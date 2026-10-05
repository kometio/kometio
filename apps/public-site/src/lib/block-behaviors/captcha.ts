import { altchaBehaviors } from './altcha';
import type { BlockBehavior } from './types';
import { turnstileBehaviors } from './turnstile';

// What a block that can carry a captcha wires: Cloudflare's widget where the
// page was given its markup, the built-in one where it was given that
// (CaptchaWidget.astro decides which, and a page has only one). The two are
// matched by their own selectors, so listing both costs nothing on a page that
// has the other.
export const captchaBehaviors: BlockBehavior[] = [
  ...turnstileBehaviors,
  ...altchaBehaviors,
];
