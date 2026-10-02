/**
 * When an event is, read from the three fields an author fills in.
 *
 * Every value is `YYYY-MM-DD` / `HH:MM` text (the date and time controls
 * write nothing else), compared as text — correct for exactly that
 * spelling — and anything else is treated as not filled in rather than
 * guessed at.
 */
export interface EventDates {
  start: string;
  /** Empty for a one-day event, and for an end that comes before the start. */
  end: string;
  /** Empty for an all-day event. */
  time: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function readEventDates(fields: {
  startDate: string;
  startTime: string;
  endDate: string;
}): EventDates {
  const start = DAY.test(fields.startDate) ? fields.startDate : '';
  const end =
    start && DAY.test(fields.endDate) && fields.endDate > start
      ? fields.endDate
      : '';
  const time = start && TIME.test(fields.startTime) ? fields.startTime : '';
  return { start, end, time };
}

/**
 * Over once its last day has passed — not its first hour: a festival
 * that started yesterday and ends tomorrow is still on, and so is an
 * evening concert on the day itself.
 *
 * `today` is the UTC day. An event is therefore kept for a few hours
 * past midnight west of Greenwich rather than dropped early east of it,
 * which is the side to err on.
 */
export function isEventOver(dates: EventDates, today: string): boolean {
  if (!dates.start) return false;
  return (dates.end || dates.start) < today;
}

/** schema.org's `startDate`: the day, or the day and the time. */
export function schemaOrgStart(dates: EventDates): string {
  return dates.time ? `${dates.start}T${dates.time}` : dates.start;
}
