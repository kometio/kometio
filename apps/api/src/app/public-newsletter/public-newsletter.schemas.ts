import { z } from 'zod';

export const subscribeNewsletterBodySchema = z.object({
  email: z.string().email(),
  honeypot: z.string().default(''),
  captchaToken: z.string().default(''),
});
export type SubscribeNewsletterBody = z.infer<
  typeof subscribeNewsletterBodySchema
>;
