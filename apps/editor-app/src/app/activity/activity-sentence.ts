import type { ActivityEntry } from '@kometio/api-contracts';
import type { AuditAction } from '@kometio/shared-types';

/** The words of one entry: a key under `activity.actions` and what fills it. */
export interface ActivitySentence {
  key: `activity.actions.${AuditAction}`;
  values: Record<string, string>;
}

/** `detail` is small facts a sentence names; one that is not there or not text is not named. */
function detailText(entry: ActivityEntry, key: string): string {
  const value = entry.detail?.[key];
  return typeof value === 'string' ? value : '';
}

/**
 * What an entry says, as a key and its values: who did it is not in the
 * sentence (the list has a column for that), what was done to what is. Kept
 * apart from the component so that every action has a sentence — the
 * `satisfies` below refuses a new action nobody worded.
 */
export function activitySentence(entry: ActivityEntry): ActivitySentence {
  return {
    key: `activity.actions.${entry.action}`,
    values: {
      target: entry.targetLabel ?? '',
      role: detailText(entry, 'role'),
      section: detailText(entry, 'section'),
      reason: detailText(entry, 'reason'),
      change: detailText(entry, 'change'),
      provider: detailText(entry, 'provider'),
    },
  };
}
