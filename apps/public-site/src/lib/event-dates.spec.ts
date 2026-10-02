import { describe, expect, it } from 'vitest';
import { isEventOver, readEventDates, schemaOrgStart } from './event-dates';

describe('readEventDates', () => {
  it('keeps what the controls write', () => {
    expect(
      readEventDates({
        startDate: '2026-09-20',
        startTime: '20:30',
        endDate: '2026-09-21',
      }),
    ).toEqual({ start: '2026-09-20', end: '2026-09-21', time: '20:30' });
  });

  it('drops an end that is not after the start, and anything that is not a date', () => {
    expect(
      readEventDates({
        startDate: '2026-09-20',
        startTime: '25:00',
        endDate: '2026-09-19',
      }),
    ).toEqual({ start: '2026-09-20', end: '', time: '' });
    expect(
      readEventDates({
        startDate: '20/09/2026',
        startTime: '20:30',
        endDate: '',
      }),
    ).toEqual({ start: '', end: '', time: '' });
  });
});

describe('isEventOver', () => {
  const dates = (start: string, end = '') => ({ start, end, time: '' });

  it('is not over on its own day', () => {
    expect(isEventOver(dates('2026-09-13'), '2026-09-13')).toBe(false);
  });

  it('is over the day after', () => {
    expect(isEventOver(dates('2026-09-12'), '2026-09-13')).toBe(true);
  });

  it('is still on while its last day has not passed', () => {
    expect(isEventOver(dates('2026-09-10', '2026-09-14'), '2026-09-13')).toBe(
      false,
    );
  });

  it('is never over without a date, so an undated event is never hidden', () => {
    expect(isEventOver(dates(''), '2026-09-13')).toBe(false);
  });
});

describe('schemaOrgStart', () => {
  it('adds the time when there is one', () => {
    expect(
      schemaOrgStart({ start: '2026-09-20', end: '', time: '20:30' }),
    ).toBe('2026-09-20T20:30');
    expect(schemaOrgStart({ start: '2026-09-20', end: '', time: '' })).toBe(
      '2026-09-20',
    );
  });
});
