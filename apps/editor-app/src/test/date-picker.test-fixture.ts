import { fireEvent, screen } from '@testing-library/react';

/**
 * Loads the calendar the DatePicker loads lazily the first time it opens
 * (components/ui/calendar.tsx), for a spec's `beforeAll`: date-fns'
 * locales are hundreds of small modules, and the first load under jsdom
 * has been measured past five seconds — the whole budget of the test that
 * happened to open a calendar first. Loaded here, with a hook's own time,
 * every test then finds it ready.
 */
export const CALENDAR_LOAD_TIMEOUT_MS = 30_000;

export async function preloadCalendar(): Promise<void> {
  await import('../components/ui/calendar');
}

/**
 * Opens a DatePicker and waits for its month grid — rendered a moment
 * after the click even once the calendar is loaded (see preloadCalendar),
 * hence more than findBy's default second.
 */
export async function openCalendar(trigger: HTMLElement): Promise<void> {
  fireEvent.click(trigger);
  await screen.findByRole('grid', undefined, { timeout: 5000 });
}

/** A day of the open calendar's month, by its number — the grid's own button, not a navigation one. */
export function dayButton(day: string): HTMLElement {
  const button = screen
    .getAllByRole('button')
    .find(
      (candidate) =>
        candidate.textContent === day &&
        candidate.closest('[role="gridcell"]') !== null,
    );
  if (!button) throw new Error(`No day ${day} in the open calendar`);
  return button;
}
