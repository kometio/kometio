import { afterEach, describe, expect, it } from 'vitest';
import { requireEnv } from './require-env';

describe('requireEnv', () => {
  const originalValue = process.env['SOME_TEST_VAR'];

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env['SOME_TEST_VAR'];
    } else {
      process.env['SOME_TEST_VAR'] = originalValue;
    }
  });

  it('returns the value when set', () => {
    process.env['SOME_TEST_VAR'] = 'hello';
    expect(requireEnv('SOME_TEST_VAR')).toBe('hello');
  });

  it('throws when missing', () => {
    delete process.env['SOME_TEST_VAR'];
    expect(() => requireEnv('SOME_TEST_VAR')).toThrow(
      'Missing required environment variable: SOME_TEST_VAR',
    );
  });

  it('throws when set to an empty string', () => {
    process.env['SOME_TEST_VAR'] = '';
    expect(() => requireEnv('SOME_TEST_VAR')).toThrow(
      'Missing required environment variable: SOME_TEST_VAR',
    );
  });
});
