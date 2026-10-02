import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupGlobalErrorHandlers } from './global-error-handlers';

describe('setupGlobalErrorHandlers', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setupGlobalErrorHandlers();
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('logs uncaught errors dispatched on window', () => {
    const error = new Error('boom');
    window.dispatchEvent(new ErrorEvent('error', { error, message: 'boom' }));

    expect(errorSpy).toHaveBeenCalledWith('[unhandled error]', error);
  });

  it('logs unhandled promise rejections dispatched on window', () => {
    const rejectedPromise = Promise.reject(new Error('rejected'));
    const event = new Event('unhandledrejection') as PromiseRejectionEvent & {
      reason: unknown;
      promise: Promise<unknown>;
    };
    Object.defineProperty(event, 'reason', { value: 'rejected' });
    Object.defineProperty(event, 'promise', { value: rejectedPromise });
    window.dispatchEvent(event);
    rejectedPromise.catch(() => undefined);

    expect(errorSpy).toHaveBeenCalledWith('[unhandled rejection]', 'rejected');
  });
});
