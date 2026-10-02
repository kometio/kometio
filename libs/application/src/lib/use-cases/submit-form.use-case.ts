import { randomUUID } from 'node:crypto';
import {
  FormNotFoundError,
  FormSubmission,
  InvalidCaptchaError,
  InvalidFormSubmissionError,
} from '@kometio/domain-core';
import {
  formFieldFileValueSchema,
  formFieldValueSchema,
  visibleFormFieldIds,
  type FormField,
} from '@kometio/shared-types';
import {
  isStoredAttachmentName,
  type AttachmentStoragePort,
  type CaptchaPort,
  type EmailPort,
  type FormRepositoryPort,
  type FormSubmissionRepositoryPort,
  type NewsletterPort,
  type PageTranslationRepositoryPort,
} from '@kometio/ports';
import {
  emailLanguageOfSite,
  type EmailLanguageDeps,
} from '../emails/email-language';
import { buildFormSubmissionNotificationEmail } from '../emails/form-submission-notification-email.template';

export interface SubmitFormDeps extends EmailLanguageDeps {
  formRepository: FormRepositoryPort;
  formSubmissionRepository: FormSubmissionRepositoryPort;
  emailPort: EmailPort;
  captchaPort: CaptchaPort;
  newsletterPort: NewsletterPort;
  /** Only to check `pageId` before it is stored — see `resolveOriginPage`. */
  pageTranslationRepository: PageTranslationRepositoryPort;
  /** Only to know where this form's own attachments live — see `isOwnAttachment`. */
  attachmentStorage: Pick<AttachmentStoragePort, 'urlPrefixFor'>;
}

export interface SubmitFormResult {
  /**
   * Notification emails that could not be sent. The submission is saved
   * by then, so they are the caller's to log, not the visitor's error:
   * failing the request made the visitor send it again, saved it twice
   * and skipped the newsletter signup.
   */
  undeliveredNotifications: { to: string; reason: unknown }[];
}

export interface SubmitFormInput {
  tenantId: string;
  formId: string;
  /**
   * Which page the visitor filled the form on — a hidden input the public
   * site renders, and therefore client-supplied. Never trusted as given:
   * see `resolveOriginPage`.
   */
  pageId: string | null;
  values: Record<string, unknown>;
  /** CSS-hidden field real visitors never fill (docs/adr/0015). Non-empty means a bot. */
  honeypot: string;
  /** Cloudflare Turnstile's client-side widget token. */
  captchaToken: string;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

// newsletter-consent renders and behaves exactly like a checkbox
// (form-fields.ts) — both a missing-required check and a Sì/No display
// need to treat the two types identically.
function isCheckboxLike(type: FormField['type']): boolean {
  return type === 'checkbox' || type === 'newsletter-consent';
}

/**
 * Every answer the visitor was shown, against its field: a required one
 * must be there, and any given one must be what its field takes
 * (`formFieldValueSchema`) — the request body is the visitor's to write,
 * so `{}` in a text field or a link of their choosing as a "file" would
 * otherwise reach the site owner's notification email.
 */
function validateValues(
  deps: Pick<SubmitFormDeps, 'attachmentStorage'>,
  formId: string,
  fields: FormField[],
  values: Record<string, unknown>,
): void {
  for (const field of fields) {
    const value = values[field.id];
    const missing = isCheckboxLike(field.type)
      ? value !== true
      : isBlank(value);
    if (missing) {
      if (field.required) {
        throw new InvalidFormSubmissionError(
          `Missing required field: ${field.label}`,
        );
      }
      if (isBlank(value)) continue;
    }
    const answer = formFieldValueSchema(field).safeParse(value);
    const valid =
      answer.success &&
      (field.type !== 'file' || isOwnAttachment(deps, formId, value));
    if (!valid) {
      throw new InvalidFormSubmissionError(
        `Invalid value for field: ${field.label}`,
      );
    }
  }
}

/**
 * A file answer is a url the visitor's browser sends back after the
 * upload, so it is believed only when it names a file this form's upload
 * stored: under the form's own prefix, one uuid-named file, no further
 * path.
 */
function isOwnAttachment(
  deps: Pick<SubmitFormDeps, 'attachmentStorage'>,
  formId: string,
  value: unknown,
): boolean {
  const file = formFieldFileValueSchema.safeParse(value);
  if (!file.success) return false;
  const prefix = deps.attachmentStorage.urlPrefixFor(formId);
  return (
    file.data.url.startsWith(prefix) &&
    isStoredAttachmentName(file.data.url.slice(prefix.length))
  );
}

function formatValue(field: FormField, value: unknown): string {
  if (isCheckboxLike(field.type)) {
    return value === true ? 'Sì' : 'No';
  }
  if (field.type === 'file') {
    // The raw value is `{ url, filename }`, not a plain string — String()
    // on it would print the useless "[object Object]" in the
    // notification email.
    const file = formFieldFileValueSchema.safeParse(value);
    return file.success ? `${file.data.filename} (${file.data.url})` : '—';
  }
  return isBlank(value) ? '—' : String(value);
}

export async function submitForm(
  deps: SubmitFormDeps,
  input: SubmitFormInput,
): Promise<SubmitFormResult> {
  const undeliveredNotifications: SubmitFormResult['undeliveredNotifications'] =
    [];
  const form = await deps.formRepository.findById(input.tenantId, input.formId);
  if (!form) {
    throw new FormNotFoundError(input.formId);
  }

  if (input.honeypot.trim() !== '') {
    // Silent accept: the caller gets the same "success" response a real
    // submission would, so a bot can never distinguish "rejected" from
    // "accepted" and tune itself against this check. Checked before the
    // CAPTCHA verify call below so a caught bot never even burns a
    // Turnstile API round-trip.
    return { undeliveredNotifications };
  }

  const captchaValid = await deps.captchaPort.verify({
    token: input.captchaToken,
  });
  if (!captchaValid) {
    // Visible failure, unlike the honeypot above: a real visitor can hit
    // this from an expired/blocked token and deserves a chance to retry,
    // not a fake success.
    throw new InvalidCaptchaError();
  }

  // Only what the visitor was shown counts: a field hidden by its
  // condition is neither required nor kept, and a key that names no field
  // at all is not kept either — the payload is the form's answers, not
  // whatever the request body happened to carry.
  const visible = visibleFormFieldIds(form.fields, input.values);
  const shownFields = form.fields.filter((field) => visible.has(field.id));
  validateValues(deps, form.id, shownFields, input.values);
  const payload = Object.fromEntries(
    shownFields
      .filter((field) => field.id in input.values)
      .map((field) => [field.id, input.values[field.id]]),
  );

  const submission = FormSubmission.create({
    id: randomUUID(),
    tenantId: input.tenantId,
    siteId: form.siteId,
    pageId: await resolveOriginPage(
      deps,
      input.tenantId,
      form.siteId,
      input.pageId,
    ),
    formId: form.id,
    payload,
  });
  await deps.formSubmissionRepository.save(submission);

  if (form.notificationEmails.length > 0) {
    const entries = shownFields.map((field) => ({
      label: field.label,
      value: formatValue(field, payload[field.id]),
    }));
    // In the site's language: the recipients are addresses somebody typed, not
    // accounts that chose one.
    const message = buildFormSubmissionNotificationEmail(
      await emailLanguageOfSite(deps, input.tenantId),
      form.name,
      entries,
    );
    // One email per address rather than one to all of them: nobody on the
    // list learns who else is on it. Every address is tried even when one
    // fails, and each failure goes back to the caller (SubmitFormResult).
    const attempts = await Promise.all(
      form.notificationEmails.map(async (to) => {
        try {
          await deps.emailPort.sendEmail({ to, ...message });
          return null;
        } catch (reason: unknown) {
          return { to, reason };
        }
      }),
    );
    for (const attempt of attempts) {
      if (attempt !== null) {
        undeliveredNotifications.push(attempt);
      }
    }
  }

  const newsletterField = form.fields.find(
    (field) => field.type === 'newsletter-consent',
  );
  if (newsletterField && payload[newsletterField.id] === true) {
    const emailField = shownFields.find((field) => field.type === 'email');
    const email = emailField ? payload[emailField.id] : undefined;
    if (typeof email === 'string' && email.trim() !== '') {
      try {
        await deps.newsletterPort.subscribe(email);
      } catch {
        // Best-effort: a marketing-list signup hiccup must never fail the
        // submission's primary purpose — the visitor's actual message is
        // already saved and notified above by this point, and there's no
        // "newsletter failed" state for the visitor to react to anyway.
      }
    }
  }
  return { undeliveredNotifications };
}

/**
 * The page a submission says it came from, once it has been checked.
 *
 * The value arrives in the request body of an unauthenticated endpoint,
 * so anyone can put any uuid there. Two things go wrong if it is stored
 * as given: an id belonging to another site (or to nothing at all) gets
 * written straight into a foreign-key column, and the insert fails with a
 * 500 that loses a real submission over a field nobody needs; and a valid
 * id from a different site would label this submission with a page its
 * owner cannot even see.
 *
 * Postgres will not catch either on its own — a foreign key is checked
 * without row-level security applied, so it is happy with any row that
 * exists, whoever it belongs to.
 *
 * An unrecognised page is therefore recorded as no page rather than
 * refused: the answers someone typed matter, the origin is a note in the
 * margin, and losing the first over the second would be the wrong trade.
 */
async function resolveOriginPage(
  deps: SubmitFormDeps,
  tenantId: string,
  siteId: string,
  pageId: string | null,
): Promise<string | null> {
  if (!pageId) return null;
  const translation = await deps.pageTranslationRepository.findById(
    tenantId,
    pageId,
  );
  return translation && translation.siteId === siteId ? translation.id : null;
}
