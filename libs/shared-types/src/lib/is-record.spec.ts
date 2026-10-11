import { describe, expect, it } from 'vitest';
import { isRecord } from './is-record';

describe('isRecord', () => {
  it('accepts a plain object, empty or not', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an array', []],
    ['a string', 'text'],
    ['a number', 0],
    ['a function', () => 1],
  ])('refuses %s', (_name, value) => {
    expect(isRecord(value)).toBe(false);
  });
});
