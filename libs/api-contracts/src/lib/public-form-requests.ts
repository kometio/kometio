import { z } from 'zod';

export const submitFormBodySchema = z.object({
  pageId: z.string().uuid().nullable().default(null),
  values: z.record(z.string(), z.unknown()),
  honeypot: z.string().default(''),
  captchaToken: z.string().default(''),
});
export type SubmitFormBody = z.infer<typeof submitFormBodySchema>;

/** What a client sends: the page, the honeypot and the captcha token may be left out. */
export type SubmitFormRequest = z.input<typeof submitFormBodySchema>;
