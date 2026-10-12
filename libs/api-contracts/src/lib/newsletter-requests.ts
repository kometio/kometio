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
