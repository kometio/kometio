import type {
  DayOfWeek,
  OpeningHoursDay,
  OpeningHoursRange,
} from '@kometio/shared-types';

/** Monday to Friday: the days "copy Monday to the weekdays" fills. */
export const WEEKDAYS_AFTER_MONDAY: readonly DayOfWeek[] = [
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
];

/**
 * Whether a range can be stored: it opens at one time and closes at
 * another. Closing at the time it opens says nothing — and both at 00:00
 * is how Google reads "closed".
 *
 * A range that closes at an earlier time than it opens runs past midnight
 * (a bar open until two): schema.org and Google both read `closes` before
 * `opens` as the next day, and the site writes the times out as they are.
 */
export function opensAndClosesApart(range: OpeningHoursRange): boolean {
  return range.closes !== range.opens;
}

/** Whether the range ends the day after it starts — `HH:MM` strings of the same length compare as the times they are. */
export function runsPastMidnight(range: OpeningHoursRange): boolean {
  return range.closes < range.opens;
}

/** Whether any range of the week is refused by `opensAndClosesApart`. */
export function hasInvalidRange(week: readonly OpeningHoursDay[]): boolean {
  return week.some((day) => day.ranges.some((r) => !opensAndClosesApart(r)));
}

/** The week with Monday's ranges on Tuesday to Friday, the rest as it was. */
export function copyMondayToWeekdays(
  week: readonly OpeningHoursDay[],
): OpeningHoursDay[] {
  const monday = week.find((day) => day.dayOfWeek === 'monday');
  const ranges = monday?.ranges ?? [];
  return week.map((day) =>
    WEEKDAYS_AFTER_MONDAY.includes(day.dayOfWeek)
      ? { ...day, ranges: ranges.map((range) => ({ ...range })) }
      : day,
  );
}
