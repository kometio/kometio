import { z } from 'zod';

/**
 * Reading the emails an integration spec caused, out of Mailpit's own HTTP
 * API (Mailpit in dev, see docs/development.md). Only the SHA-256 hash of a
 * token is ever persisted (see VerificationTokenAdapter), so the raw token
 * genuinely only exists in the email that was sent: polling Mailpit is the
 * only way to test the real, user-facing path end to end.
 */
const MAILPIT_URL = `http://localhost:${process.env['MAILPIT_UI_PORT'] ?? '8025'}`;

/**
 * How long to wait for an email that has to travel over SMTP to a real
 * Mailpit before the test gives up.
 *
 * Deliberately generous, because it is NOT a performance assertion: there
 * is no deterministic signal to wait on here, only polling, and the
 * deadline exists so a genuine failure ends instead of hanging forever.
 * Five seconds was not generous, and this suite runs `--parallel=1` with
 * coverage on a shared runner — so it timed out on load that had nothing
 * to do with email, and the fix was always "run it again". A test that
 * cries wolf is worse than no test: it teaches everyone to re-run a red
 * build, which is how a real failure eventually goes unnoticed.
 *
 * Bounded by the spec's `jest.setTimeout`, not independent of it: a test
 * that chains several of these waits needs a Jest timeout that clears their
 * combined worst case, so the two numbers have to be chosen together.
 */
export const EMAIL_DELIVERY_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 200;

const searchResultSchema = z.object({
  messages: z
    .array(
      z.object({
        ID: z.string(),
        Subject: z.string(),
        To: z.array(z.object({ Address: z.string() })),
      }),
    )
    .nullable(),
});
type MailpitMessage = NonNullable<
  z.infer<typeof searchResultSchema>['messages']
>[number];
const messageSchema = z.object({ Text: z.string() });

/**
 * The messages sent to `toEmail`, newest first.
 *
 * Through Mailpit's SEARCH endpoint. This used `/api/v1/messages?query=`,
 * and that endpoint ignores `query`: it returned the whole mailbox, so the
 * "invite" read below was whichever email arrived last to anyone. The test
 * passed only while that happened to be its own — and failed, reading
 * another test's email, whenever a suite running alongside sent one after
 * it ("10 email(s) for invitee-…, none carrying an inviteToken").
 *
 * Filtered on the address as well, so a search that matches more loosely
 * than asked can never hand back someone else's message.
 */
async function messagesFor(toEmail: string): Promise<MailpitMessage[]> {
  const res = await fetch(
    `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${toEmail}"`)}`,
  );
  const body = searchResultSchema.parse(await res.json());
  return (body.messages ?? []).filter((message) =>
    message.To.some((recipient) => recipient.Address === toEmail),
  );
}

/**
 * One polling loop for every wait below, so the timeout is one number
 * rather than several that can drift.
 *
 * `read` returns `null` for "not yet"; `describeFailure` gets the mailbox
 * as it finally stood, so the error can say whether nothing arrived at all
 * or something arrived without what was expected in it — the difference
 * between "slow" and "broken", which the old message could not tell.
 */
async function pollMailbox<T>(
  toEmail: string,
  read: (messages: MailpitMessage[]) => Promise<T | null>,
  describeFailure: (messages: MailpitMessage[]) => string,
): Promise<T> {
  const deadline = Date.now() + EMAIL_DELIVERY_TIMEOUT_MS;
  for (;;) {
    const messages = await messagesFor(toEmail);
    const found = await read(messages);
    if (found !== null) {
      return found;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `${describeFailure(messages)} after ${EMAIL_DELIVERY_TIMEOUT_MS / 1000}s`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

/**
 * The value of the query parameter `param` in the link of the latest email
 * sent to `toEmail` (`inviteToken`, `changeToken` …).
 */
export async function fetchEmailedToken(
  toEmail: string,
  param: string,
): Promise<string> {
  return pollMailbox(
    toEmail,
    async (messages) => {
      if (messages.length === 0) {
        return null;
      }
      const messageRes = await fetch(
        `${MAILPIT_URL}/api/v1/message/${messages[0].ID}`,
      );
      const message = messageSchema.parse(await messageRes.json());
      return message.Text.match(new RegExp(`${param}=([^&\\s]+)`))?.[1] ?? null;
    },
    (messages) =>
      messages.length === 0
        ? `No email at all for ${toEmail}`
        : `${messages.length} email(s) for ${toEmail}, none carrying a ${param}`,
  );
}

/** Waits until at least `count` messages exist for `toEmail` — used to confirm a resend actually sent a second email, without assuming Mailpit's ordering. */
export async function waitForMessageCount(
  toEmail: string,
  count: number,
): Promise<void> {
  await pollMailbox(
    toEmail,
    (messages) => Promise.resolve(messages.length >= count ? true : null),
    (messages) =>
      `Expected ${count} email(s) for ${toEmail}, found ${messages.length}`,
  );
}

/** How many emails have reached `toEmail` so far — for asserting that none did. */
export async function countEmailsTo(toEmail: string): Promise<number> {
  return (await messagesFor(toEmail)).length;
}

/** The subject of every email that has reached `toEmail` so far, newest first. */
export async function subjectsOfEmailsTo(toEmail: string): Promise<string[]> {
  return (await messagesFor(toEmail)).map((message) => message.Subject);
}
