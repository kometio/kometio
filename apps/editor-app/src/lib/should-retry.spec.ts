import { describe, expect, it } from 'vitest';
import { ApiError, ServerUnreachableError } from './http-client';
import { shouldRetry } from './should-retry';

describe('shouldRetry', () => {
  it('never retries an answer that says the request itself is wrong', () => {
    expect(shouldRetry(0, new ApiError(401, null))).toBe(false);
    expect(shouldRetry(0, new ApiError(409, null))).toBe(false);
  });

  it('retries a server error, up to three times', () => {
    const error = new ApiError(503, null);

    expect(shouldRetry(0, error)).toBe(true);
    expect(shouldRetry(2, error)).toBe(true);
    expect(shouldRetry(3, error)).toBe(false);
  });

  it('retries a server that did not answer once, so the person is told soon', () => {
    const error = new ServerUnreachableError('http://localhost:3000/api');

    expect(shouldRetry(0, error)).toBe(true);
    expect(shouldRetry(1, error)).toBe(false);
  });

  it('retries what it cannot classify, up to three times', () => {
    expect(shouldRetry(2, new Error('boom'))).toBe(true);
    expect(shouldRetry(3, new Error('boom'))).toBe(false);
  });
});
