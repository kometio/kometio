import { z } from 'zod';

/**
 * One of the signed-in person's sign-ins, as the list of where they are signed
 * in shows it (docs/adr/0129): a label to recognise the device by, when it was
 * made and last used, and whether it is the one asking. No address, no header,
 * and nothing that is a way in: `id` names the session to end and is not its
 * token.
 */
export const accountSessionSchema = z.object({
  id: z.string(),
  /** "Chrome on macOS"; `null` where the sign-in's agent was not recognised, and for those older than the label. */
  deviceLabel: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
  isCurrent: z.boolean(),
});

export type AccountSession = z.infer<typeof accountSessionSchema>;

export const accountSessionListSchema = z.object({
  items: z.array(accountSessionSchema),
});

export type AccountSessionList = z.infer<typeof accountSessionListSchema>;
