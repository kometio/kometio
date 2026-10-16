import { altchaBehaviors } from './altcha';
import type { BlockBehavior } from './types';

// What a block that can carry a captcha wires: the widget built into Kometio
// (CaptchaWidget.astro draws its markup, docs/adr/0103, 0145). Form and
// NewsletterSignup share it, as VideoEmbed and MapEmbed share the consent gate's.
export const captchaBehaviors: BlockBehavior[] = [...altchaBehaviors];
