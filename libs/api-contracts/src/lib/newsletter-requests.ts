import { z } from 'zod';

export const subscribeNewsletterBodySchema = z.object({
  email: z.string().email(),
  honeypot: z.string().default(''),
  captchaToken: z.string().default(''),
});
export type SubscribeNewsletterBody = z.infer<
  typeof subscribeNewsletterBodySchema
>;

/** What a client sends: the honeypot and the captcha token may be left out. */
export type SubscribeNewsletterRequest = z.input<
  typeof subscribeNewsletterBodySchema
>;

/**
 * `GET /public/pages/newsletter` — what the public site needs to draw the
 * newsletter signup: whether it shows the captcha. The server asks for the
 * solution on its own account, from the same setting (docs/adr/0145).
 */
export const publicNewsletterSettingsSchema = z.object({
  captchaEnabled: z.boolean(),
});
export type PublicNewsletterSettings = z.infer<
  typeof publicNewsletterSettingsSchema
>;
