import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RouteError } from './route-error';
import { ApiError } from '../../lib/http-client';

describe('RouteError', () => {
  it('says something went wrong, and calls reset when retrying', () => {
    const reset = vi.fn();

    render(<RouteError error={new Error('network down')} reset={reset} />);

    expect(screen.getByRole('alert')).toBeTruthy();
    // A bug's raw exception is logged, not shown.
    expect(screen.queryByText(/network down/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /riprova/i }));
    expect(reset).toHaveBeenCalled();
  });

  it("shows the server's own sentence when the server gave one", () => {
    render(
      <RouteError
        error={
          new ApiError(403, { message: 'Forbidden resource', statusCode: 403 })
        }
        reset={vi.fn()}
      />,
    );

    expect(screen.getByText('Forbidden resource')).toBeTruthy();
  });

  it('logs the error, so it does not disappear without a trace', () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const error = new Error('network down');

    render(<RouteError error={error} reset={vi.fn()} />);

    expect(errorSpy).toHaveBeenCalledWith('[route error]', error);
    errorSpy.mockRestore();
  });
});
