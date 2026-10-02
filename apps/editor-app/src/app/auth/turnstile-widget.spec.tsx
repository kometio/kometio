import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TurnstileWidget } from './turnstile-widget';

describe('TurnstileWidget', () => {
  const realTurnstile = window.turnstile;

  afterEach(() => {
    window.turnstile = realTurnstile;
  });

  it('renders the widget and calls onToken with the token from the callback', () => {
    let capturedCallback: ((token: string) => void) | undefined;
    window.turnstile = {
      render: (_container, options) => {
        capturedCallback = options.callback;
        return 'widget-1';
      },
      reset: vi.fn(),
      remove: vi.fn(),
    };
    const onToken = vi.fn();

    render(<TurnstileWidget siteKey="test-site-key" onToken={onToken} />);
    capturedCallback?.('real-token');

    expect(onToken).toHaveBeenCalledWith('real-token');
  });

  it('calls onToken(null) when the challenge expires', () => {
    let capturedExpiredCallback: (() => void) | undefined;
    window.turnstile = {
      render: (_container, options) => {
        capturedExpiredCallback = options['expired-callback'];
        return 'widget-1';
      },
      reset: vi.fn(),
      remove: vi.fn(),
    };
    const onToken = vi.fn();

    render(<TurnstileWidget siteKey="test-site-key" onToken={onToken} />);
    capturedExpiredCallback?.();

    expect(onToken).toHaveBeenCalledWith(null);
  });

  it('calls onToken(null) on a widget error', () => {
    let capturedErrorCallback: (() => void) | undefined;
    window.turnstile = {
      render: (_container, options) => {
        capturedErrorCallback = options['error-callback'];
        return 'widget-1';
      },
      reset: vi.fn(),
      remove: vi.fn(),
    };
    const onToken = vi.fn();

    render(<TurnstileWidget siteKey="test-site-key" onToken={onToken} />);
    capturedErrorCallback?.();

    expect(onToken).toHaveBeenCalledWith(null);
  });

  it('resets the widget when resetSignal changes, for a fresh challenge after a rejected token', () => {
    const reset = vi.fn();
    window.turnstile = {
      render: () => 'widget-1',
      reset,
      remove: vi.fn(),
    };

    const { rerender } = render(
      <TurnstileWidget
        siteKey="test-site-key"
        onToken={vi.fn()}
        resetSignal={0}
      />,
    );
    expect(reset).not.toHaveBeenCalled();

    rerender(
      <TurnstileWidget
        siteKey="test-site-key"
        onToken={vi.fn()}
        resetSignal={1}
      />,
    );

    expect(reset).toHaveBeenCalledWith('widget-1');
  });

  it('removes the widget on unmount', () => {
    const remove = vi.fn();
    window.turnstile = {
      render: () => 'widget-1',
      reset: vi.fn(),
      remove,
    };

    const { unmount } = render(
      <TurnstileWidget siteKey="test-site-key" onToken={vi.fn()} />,
    );
    unmount();

    expect(remove).toHaveBeenCalledWith('widget-1');
  });
});
