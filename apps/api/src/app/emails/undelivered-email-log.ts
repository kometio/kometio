import { Injectable, Logger } from '@nestjs/common';
import type { UndeliveredEmail } from '@kometio/application';

/**
 * Where an email that did not go out is written down.
 *
 * A use case that sends an email AFTER something is done (a password changed,
 * a form saved, an invitation made) does not fail for it: it answers what
 * went wrong, and the controller decides who is told. For the person it is
 * usually nobody, because what they asked for has happened or because the
 * answer would say which addresses have an account; for whoever runs the server
 * it is this entry, with the reason, in the log. One place for the form of that
 * entry, so the six controllers that report one cannot word it six ways.
 *
 * `what` names the thing that was being done ("Password reset", "Invitation"),
 * and the entry reads "Password reset: the email to x@y.z was not sent".
 */
@Injectable()
export class UndeliveredEmailLog {
  private readonly logger = new Logger('Email');

  report(what: string, undelivered: readonly UndeliveredEmail[]): void {
    for (const { to, reason } of undelivered) {
      this.logger.error(
        `${what}: the email to ${to} was not sent`,
        reason instanceof Error ? reason.stack : String(reason),
      );
    }
  }
}
