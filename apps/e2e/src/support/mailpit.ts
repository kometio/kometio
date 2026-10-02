import type { APIRequestContext } from '@playwright/test';
import { z } from 'zod';

const searchResultSchema = z.object({
  messages: z.array(
    z.object({
      ID: z.string(),
      Subject: z.string(),
      To: z.array(z.object({ Address: z.string() })),
    }),
  ),
});

export type MailpitMessage = z.infer<
  typeof searchResultSchema
>['messages'][number];

/**
 * The mailbox every email the stack sends lands in, in development and in
 * CI alike (docs/adr/0011). A test addresses its emails to recipients no
 * other test uses, so it finds its own and can delete them after.
 */
export class Mailpit {
  constructor(private readonly request: APIRequestContext) {}

  async messagesTo(address: string): Promise<MailpitMessage[]> {
    const response = await this.request.get('api/v1/search', {
      params: { query: `to:"${address}"` },
    });
    if (!response.ok()) {
      throw new Error(`Mailpit search answered ${response.status()}`);
    }
    return searchResultSchema.parse(await response.json()).messages;
  }

  async delete(messages: readonly MailpitMessage[]): Promise<void> {
    if (messages.length === 0) return;
    await this.request.delete('api/v1/messages', {
      data: { IDs: messages.map((message) => message.ID) },
    });
  }
}
