import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Dates as the editor shows them: "Sep 12, 2026" / "12 set 2026", in the
 * editor's language. Each list used to call `toLocaleDateString` with no
 * options, which prints 9/12/2026 — the 12th of September in one country
 * and the 9th of December in the next, with nothing on screen to say which.
 *
 * `null` for a value that is not a date, so each caller keeps saying what
 * an unreadable one looks like where it is shown.
 */
/**
 * The three ways the editor writes a moment: the day ("12 set 2026"),
 * the day and the time, for a version or a submission, and the time
 * alone, for "saved at" on a page being edited today.
 */
const STYLES = {
  date: { dateStyle: 'medium' },
  dateTime: { dateStyle: 'medium', timeStyle: 'short' },
  /** Where there is no room for the year: a chip on the bar, a mark on a row. The day and the hour, in the person's language. */
  dayAndTime: {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  },
  time: { timeStyle: 'short' },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

export type DateFormatStyle = keyof typeof STYLES;

/**
 * The time zone of this browser, by name ("Europe/Rome"): what a time typed
 * into a `datetime-local` field is in, so that a dialog can say whose "09:00"
 * it is. Here with the rest of what the editor asks `Intl` for.
 */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function useFormatDate(
  style: DateFormatStyle = 'date',
): (value: string | number | Date) => string | null {
  const { i18n } = useTranslation();
  const language = i18n.language;
  return useMemo(() => {
    const format = new Intl.DateTimeFormat(language, STYLES[style]);
    return (value) => {
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? null : format.format(date);
    };
  }, [language, style]);
}
