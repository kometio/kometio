import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SmtpEmailAdapter } from './smtp-email.adapter';

/**
 * Runs against Mailpit (docker-compose) — see
 * docs/development.md. Mailpit needs no auth, matching how it's
 * configured in .env.example.
 */
const MAILPIT_API = 'http://localhost:8025/api/v1';

/** What Mailpit's API answers with — read through a schema, so a spec fails on the answer it did not get rather than on a property of `undefined`. */
const mailpitMessageSchema = z.object({
  From: z.object({ Address: z.string() }),
  To: z.array(z.object({ Address: z.string() })),
  Subject: z.string(),
  ID: z.string(),
});
type MailpitMessage = z.infer<typeof mailpitMessageSchema>;
const mailpitListSchema = z.object({
  messages: z.array(mailpitMessageSchema),
});
const mailpitBodySchema = z.object({ HTML: z.string(), Text: z.string() });

async function latestMessage(): Promise<MailpitMessage> {
  const res = await fetch(`${MAILPIT_API}/messages`);
  const body = mailpitListSchema.parse(await res.json());
  const [message] = body.messages;
  if (!message) {
    throw new Error('No message arrived at Mailpit');
  }
  return message;
}

async function messageBody(
  id: string,
): Promise<{ HTML: string; Text: string }> {
  const res = await fetch(`${MAILPIT_API}/message/${id}`);
  return mailpitBodySchema.parse(await res.json());
}

describe('SmtpEmailAdapter (integration)', () => {
  const adapter = new SmtpEmailAdapter({
    host: 'localhost',
    port: 1025,
    fromAddress: 'noreply@kometio.local',
  });

  beforeEach(async () => {
    await fetch(`${MAILPIT_API}/messages`, { method: 'DELETE' });
  });

  it('delivers an email that arrives at the SMTP server with matching fields', async () => {
    await adapter.sendEmail({
      to: 'destinatario@example.com',
      subject: 'Verifica il tuo indirizzo email',
      html: '<p>Ciao, <a href="https://example.com/verify">verifica qui</a></p>',
      text: 'Ciao, verifica qui: https://example.com/verify',
    });

    const message = await latestMessage();
    expect(message.From.Address).toBe('noreply@kometio.local');
    expect(message.To[0]?.Address).toBe('destinatario@example.com');
    expect(message.Subject).toBe('Verifica il tuo indirizzo email');

    const body = await messageBody(message.ID);
    expect(body.HTML).toContain('https://example.com/verify');
    expect(body.Text).toContain('https://example.com/verify');
  });
});
