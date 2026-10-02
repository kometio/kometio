import type { EmailMessage, EmailPort } from '@kometio/ports';

/** A message that did not go out, for the caller to put in a log. */
export interface UndeliveredEmail {
  to: string;
  reason: unknown;
}

/**
 * Sends a notice that comes AFTER something that has already been done —
 * a password changed, an address moved — and answers what went wrong
 * instead of throwing it.
 *
 * The change stands whether or not the mail leaves, and failing the request
 * for it would only make the person ask again for something already
 * done: what they need is for the failure to be found in the log, the way
 * a form's notification that did not go out is (`submitForm`).
 */
export async function trySendEmail(
  emailPort: EmailPort,
  message: EmailMessage,
): Promise<UndeliveredEmail[]> {
  try {
    await emailPort.sendEmail(message);
    return [];
  } catch (reason: unknown) {
    return [{ to: message.to, reason }];
  }
}
