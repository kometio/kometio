import { describe, expect, it, vi } from 'vitest';
import type { ErrorReporterPort } from '@kometio/ports';
import { reportErrors } from './report-errors';

function reporter() {
  const captureException = vi.fn<ErrorReporterPort['captureException']>();
  const port: ErrorReporterPort = {
    enabled: true,
    captureException,
    flush: () => Promise.resolve(),
  };
  return Object.assign(port, { captureException });
}

describe('reportErrors', () => {
  it('hands back what was rendered, and reports nothing', async () => {
    const r = reporter();

    const result = await reportErrors(r, {}, () => Promise.resolve('page'));

    expect(result).toBe('page');
    expect(r.captureException).not.toHaveBeenCalled();
  });

  it('reports what is thrown, with where, and throws the same error on', async () => {
    const r = reporter();
    const error = new Error('Public pages API error: 500');

    await expect(
      reportErrors(r, { method: 'GET', path: '/it/chi-siamo' }, () =>
        Promise.reject(error),
      ),
    ).rejects.toBe(error);

    expect(r.captureException).toHaveBeenCalledWith(error, {
      method: 'GET',
      path: '/it/chi-siamo',
    });
  });

  it('throws the error that happened when the report itself fails', async () => {
    const r = reporter();
    r.captureException.mockImplementation(() => {
      throw new Error('reporter is down');
    });
    const error = new Error('render failed');

    await expect(reportErrors(r, {}, () => Promise.reject(error))).rejects.toBe(
      error,
    );
  });
});
