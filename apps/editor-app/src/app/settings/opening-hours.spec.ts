import { describe, expect, it } from 'vitest';
import type { OpeningHoursDay } from '@kometio/shared-types';
import {
  copyMondayToWeekdays,
  opensAndClosesApart,
  runsPastMidnight,
  hasInvalidRange,
} from './opening-hours';

const week = (
  monday: OpeningHoursDay['ranges'],
  saturday: OpeningHoursDay['ranges'] = [],
): OpeningHoursDay[] =>
  (
    [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ] as const
  ).map((dayOfWeek) => ({
    dayOfWeek,
    ranges:
      dayOfWeek === 'monday'
        ? monday
        : dayOfWeek === 'saturday'
          ? saturday
          : [],
  }));

describe('opensAndClosesApart', () => {
  it('accepts a range that closes later than it opens', () => {
    expect(opensAndClosesApart({ opens: '09:00', closes: '18:30' })).toBe(true);
  });

  it('accepts one that runs past midnight — a bar open until two', () => {
    expect(opensAndClosesApart({ opens: '18:00', closes: '02:00' })).toBe(true);
  });

  it('refuses one that closes when it opens', () => {
    expect(opensAndClosesApart({ opens: '09:00', closes: '09:00' })).toBe(
      false,
    );
    expect(opensAndClosesApart({ opens: '00:00', closes: '00:00' })).toBe(
      false,
    );
  });
});

describe('runsPastMidnight', () => {
  it('is true only when it closes at an earlier time than it opens', () => {
    expect(runsPastMidnight({ opens: '18:00', closes: '02:00' })).toBe(true);
    expect(runsPastMidnight({ opens: '09:00', closes: '18:00' })).toBe(false);
    expect(runsPastMidnight({ opens: '09:00', closes: '09:00' })).toBe(false);
  });
});

describe('hasInvalidRange', () => {
  it('is false for a week of good ranges, and for a week with none', () => {
    expect(hasInvalidRange(week([{ opens: '09:00', closes: '13:00' }]))).toBe(
      false,
    );
    expect(hasInvalidRange(week([]))).toBe(false);
  });

  it('finds a bad one on any day', () => {
    expect(
      hasInvalidRange(week([], [{ opens: '10:00', closes: '10:00' }])),
    ).toBe(true);
  });

  it('does not take a range past midnight for one', () => {
    expect(
      hasInvalidRange(week([], [{ opens: '18:00', closes: '02:00' }])),
    ).toBe(false);
  });
});

describe('copyMondayToWeekdays', () => {
  it('puts Monday’s ranges on Tuesday to Friday and leaves the weekend alone', () => {
    const monday = [
      { opens: '09:00', closes: '13:00' },
      { opens: '15:00', closes: '19:00' },
    ];
    const result = copyMondayToWeekdays(
      week(monday, [{ opens: '10:00', closes: '12:00' }]),
    );

    for (const day of ['tuesday', 'wednesday', 'thursday', 'friday']) {
      expect(result.find((d) => d.dayOfWeek === day)?.ranges).toEqual(monday);
    }
    expect(result.find((d) => d.dayOfWeek === 'saturday')?.ranges).toEqual([
      { opens: '10:00', closes: '12:00' },
    ]);
    expect(result.find((d) => d.dayOfWeek === 'sunday')?.ranges).toEqual([]);
  });

  it('gives each day its own ranges, so editing one does not edit the others', () => {
    const result = copyMondayToWeekdays(
      week([{ opens: '09:00', closes: '13:00' }]),
    );

    const tuesday = result.find((d) => d.dayOfWeek === 'tuesday');
    const wednesday = result.find((d) => d.dayOfWeek === 'wednesday');
    expect(tuesday?.ranges[0]).not.toBe(wednesday?.ranges[0]);
  });

  it('clears the weekdays when Monday is closed', () => {
    const copied = copyMondayToWeekdays(week([]));

    expect(copied.every((day) => day.ranges.length === 0)).toBe(true);
  });
});
