import { LogEmailAdapter } from '@kometio/log-email-adapter';
import type { EmailPort } from '@kometio/ports';
import { SmtpEmailAdapter } from '@kometio/smtp-email-adapter';
import { requiredIn, type ApiEnv } from '../../env-schema';

/**
 * Whether the emails of this deployment reach the people they are for: it has
 * a mail server, and it is not a demo. What the editor is told (`GET
 * /deployment`) and what `createEmailPort` builds are the same answer.
 */
export function deploymentSendsEmail(
  env: Pick<ApiEnv, 'SMTP_HOST' | 'KOMETIO_DEMO'>,
): boolean {
  return env.SMTP_HOST !== undefined && env.KOMETIO_DEMO !== 'true';
}

/**
 * The deployment's mail server when it has one (SMTP_HOST set), and the log
 * when it has not (docs/adr/0103).
 *
 * A first server has no SMTP account yet, and asking for one before the API
 * would start put the highest barrier in the way of the first run. Without a
 * mail server the emails are written to the log, links included, so an
 * invitation or a password reset can still be followed by whoever runs the
 * server; the editor tells the administrator that this is what is happening.
 * `write` is where an entry goes: the API's own logger, so it sits among the
 * rest of its output.
 *
 * With SMTP_HOST set, the port and the sender are required (the schema checks
 * it), and `requiredIn` narrows them for the compiler.
 *
 * A demo (docs/adr/0118) sends nothing, whatever it is configured with: anybody
 * who signs in to it can make a form notify an address of their choosing, and
 * the mail server would be theirs to use. Its emails go to the log.
 */
export function createEmailPort(
  env: ApiEnv,
  write: (entry: string) => void,
): EmailPort {
  if (!deploymentSendsEmail(env)) {
    return new LogEmailAdapter(write);
  }
  return new SmtpEmailAdapter({
    host: requiredIn(env, 'SMTP_HOST'),
    port: requiredIn(env, 'SMTP_PORT'),
    fromAddress: requiredIn(env, 'SMTP_FROM_ADDRESS'),
    user: env.SMTP_USER || undefined,
    password: env.SMTP_PASSWORD || undefined,
  });
}
