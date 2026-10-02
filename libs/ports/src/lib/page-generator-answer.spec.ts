import { describe, expect, it } from 'vitest';
import { PageGenerationFailedError } from '@kometio/domain-core';
import {
  failureOfProviderStatus,
  readProviderAnswer,
} from './page-generator-answer';

describe('readProviderAnswer', () => {
  it('reads a finished answer as the JSON it was asked for', () => {
    expect(readProviderAnswer('{"blocks":[]}', 'complete')).toEqual({
      blocks: [],
    });
  });

  it.each([
    ['refused', 'refused'],
    ['truncated', 'truncated'],
  ] as const)(
    'says a %s answer is no page, whatever its text',
    (ending, failure) => {
      expect(() => readProviderAnswer('{"blocks":[]}', ending)).toThrow(
        new PageGenerationFailedError(failure),
      );
    },
  );

  it('calls an answer that is not JSON not-json', () => {
    expect(() => readProviderAnswer('Ecco la pagina:', 'complete')).toThrow(
      new PageGenerationFailedError('not-json'),
    );
  });
});

describe('failureOfProviderStatus', () => {
  it.each([
    [401, 'rejected-credentials'],
    [403, 'rejected-credentials'],
    [429, 'rate-limited'],
    [500, 'unreachable'],
    [undefined, 'unreachable'],
  ] as const)('reads %s as %s', (status, failure) => {
    expect(failureOfProviderStatus(status)).toBe(failure);
  });
});
