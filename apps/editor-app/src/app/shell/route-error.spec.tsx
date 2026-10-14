import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RouteError } from './route-error';
import { ApiError, ServerUnreachableError } from '../../lib/http-client';

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

  it('names both addresses when the server did not answer, and what to do', () => {
    const reset = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <RouteError
        error={new ServerUnreachableError('http://localhost:3000/api')}
        reset={reset}
      />,
    );

    expect(
      screen.getByRole('heading', { name: /non raggiunge il server/i }),
    ).toBeTruthy();
    // The page's own address, and the server's: the two that must agree.
    expect(screen.getByText(window.location.origin)).toBeTruthy();
    expect(screen.getByText('http://localhost:3000/api')).toBeTruthy();
    expect(screen.getByText(/log del container/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /riprova/i }));
    expect(reset).toHaveBeenCalled();
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
