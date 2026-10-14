/**
 * Why a scheduled publication is held back instead of published when its
 * moment comes (docs/adr/0135): the permission to publish is asked again then,
 * of the person who set the moment, because it is theirs that the publication
 * is made under and a role can change in between.
 *
 * Stored in `scheduleFailure` as these words, which the editor knows how to
 * say in the person's language; anything else in that column is the message
 * of an error, shown as it is.
 */
export const SCHEDULE_BLOCKED_REASONS = [
  'scheduler-gone',
  'scheduler-inactive',
  'scheduler-cannot-publish',
] as const;

export type ScheduleBlockedReason = (typeof SCHEDULE_BLOCKED_REASONS)[number];

export function isScheduleBlockedReason(
  value: string,
): value is ScheduleBlockedReason {
  return SCHEDULE_BLOCKED_REASONS.some((reason) => reason === value);
}
