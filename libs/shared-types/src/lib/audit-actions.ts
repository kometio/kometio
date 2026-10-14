import { z } from 'zod';

/**
 * What the activity log of a site (docs/adr/0130) can say happened: the
 * security and configuration events, and none of the content ones. One list
 * for the database column's reader, the API's answer and the editor's
 * sentences, so an action cannot be recorded that nobody can word.
 *
 * Names are `subject.what-happened`, in the past tense: an entry is something
 * that took place.
 */
export const AUDIT_ACTIONS = [
  'login.succeeded',
  'login.failed',
  'user.invited',
  'user.invite_resent',
  'user.invite_cancelled',
  'user.role_changed',
  'user.activated',
  'user.deactivated',
  'account.password_changed',
  'account.password_reset',
  'account.email_change_requested',
  'account.email_changed',
  'account.two_factor_enabled',
  'account.two_factor_disabled',
  'account.recovery_code_used',
  'account.two_factor_reset',
  'site.settings_changed',
  'site.theme_changed',
  'site.ai_changed',
  'theme.uploaded',
  'archive.exported',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const auditActionSchema = z.enum(AUDIT_ACTIONS);

/**
 * What an entry may carry besides its action: small facts that say which
 * (the role given, the settings section), never what was typed. No key, no
 * password, no address of a visitor; the schema is the whole of it so that
 * the column cannot become a place to put a request body.
 */
export const auditDetailSchema = z.record(
  z.string().max(40),
  z.union([z.string().max(200), z.number(), z.boolean(), z.null()]),
);

export type AuditDetail = z.infer<typeof auditDetailSchema>;

/** How long an entry is kept (days): long enough to find out what happened last quarter, short enough to be a log and not a history. */
export const AUDIT_RETENTION_DAYS = 90;
