import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AltchaWidget } from './altcha-widget';
import { loadAltcha } from './altcha-loader';

// The widget itself is a download of its own and runs a proof of work in a
// worker: neither belongs in jsdom. A first-run test in a real browser is where
// the two meet. Here its element is a stand-in with the two methods the
// component calls, and the loader is told to have loaded it.
vi.mock('./altcha-loader', () => ({ loadAltcha: vi.fn() }));

class FakeWidget extends HTMLElement {
  readonly reset = vi.fn();
  readonly verify = vi.fn();
}
customElements.define('altcha-widget', FakeWidget);

const CHALLENGE_URL = 'https://api.example.test/api/captcha/challenge';

function widgetIn(container: HTMLElement): FakeWidget {
  const widget = container.querySelector('altcha-widget');
  if (!(widget instanceof FakeWidget)) throw new Error('no widget in the page');
  return widget;
}

function say(widget: HTMLElement, detail: unknown) {
  act(() => {
    widget.dispatchEvent(new CustomEvent('statechange', { detail }));
  });
}

describe('AltchaWidget', () => {
  beforeEach(() => {
    vi.mocked(loadAltcha).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('asks the API for its challenge as soon as it is on the page, in the language of the editor', async () => {
    const { container } = render(
      <AltchaWidget challengeUrl={CHALLENGE_URL} onToken={vi.fn()} />,
    );

    await waitFor(() =>
      expect(container.querySelector('altcha-widget')).not.toBeNull(),
    );
    const widget = widgetIn(container);
    expect(widget.getAttribute('challenge')).toBe(CHALLENGE_URL);
    expect(widget.getAttribute('auto')).toBe('onload');
    // The suite is pinned to Italian.
    expect(widget.getAttribute('language')).toBe('it');
    expect(loadAltcha).toHaveBeenCalledWith('it');
  });

  it('hands the form the solution once the widget reports it verified', async () => {
    const onToken = vi.fn();
    const { container } = render(
      <AltchaWidget challengeUrl={CHALLENGE_URL} onToken={onToken} />,
    );
    await waitFor(() =>
      expect(container.querySelector('altcha-widget')).not.toBeNull(),
    );

    say(widgetIn(container), { state: 'verified', payload: 'the-solution' });

    expect(onToken).toHaveBeenLastCalledWith('the-solution');
  });

  /*
   * A token that is no longer good has to take the button away again, or the
   * form would send an expired solution and be told it is wrong.
   */
  it.each(['verifying', 'unverified', 'expired', 'error'])(
    'has nothing to submit while the widget is %s',
    async (state) => {
      const onToken = vi.fn();
      const { container } = render(
        <AltchaWidget challengeUrl={CHALLENGE_URL} onToken={onToken} />,
      );
      await waitFor(() =>
        expect(container.querySelector('altcha-widget')).not.toBeNull(),
      );
      const widget = widgetIn(container);
      say(widget, { state: 'verified', payload: 'the-solution' });

      say(widget, { state });

      expect(onToken).toHaveBeenLastCalledWith(null);
    },
  );

  it('takes nothing as a solution that is not a string, or a verified state with none', async () => {
    const onToken = vi.fn();
    const { container } = render(
      <AltchaWidget challengeUrl={CHALLENGE_URL} onToken={onToken} />,
    );
    await waitFor(() =>
      expect(container.querySelector('altcha-widget')).not.toBeNull(),
    );
    const widget = widgetIn(container);

    say(widget, { state: 'verified' });
    say(widget, { state: 'verified', payload: 42 });
    say(widget, null);
    say(widget, 'verified');

    expect(onToken).toHaveBeenCalledTimes(4);
    expect(onToken.mock.calls.every(([token]) => token === null)).toBe(true);
  });

  it('keeps nothing to submit, and no widget, when the widget could not be loaded', async () => {
    vi.mocked(loadAltcha).mockRejectedValue(new Error('network'));
    const onToken = vi.fn();

    const { container } = render(
      <AltchaWidget challengeUrl={CHALLENGE_URL} onToken={onToken} />,
    );

    await waitFor(() => expect(onToken).toHaveBeenCalledWith(null));
    expect(container.querySelector('altcha-widget')).toBeNull();
  });

  it('does not put a widget on a page it has already left', async () => {
    let finishLoading: () => void = () => undefined;
    vi.mocked(loadAltcha).mockReturnValue(
      new Promise<void>((resolve) => {
        finishLoading = resolve;
      }),
    );
    const { container, unmount } = render(
      <AltchaWidget challengeUrl={CHALLENGE_URL} onToken={vi.fn()} />,
    );
    const stillThere = container;

    unmount();
    finishLoading();
    await Promise.resolve();

    expect(stillThere.querySelector('altcha-widget')).toBeNull();
  });

  it('takes its widget away with it, so a form drawn again asks for a new challenge', async () => {
    const first = render(
      <AltchaWidget challengeUrl={CHALLENGE_URL} onToken={vi.fn()} />,
    );
    await waitFor(() =>
      expect(first.container.querySelector('altcha-widget')).not.toBeNull(),
    );

    first.unmount();

    expect(document.querySelector('altcha-widget')).toBeNull();
  });

  it('starts over when the form says the last solution was spent: a new challenge, solved again', async () => {
    const { container, rerender } = render(
      <AltchaWidget
        challengeUrl={CHALLENGE_URL}
        onToken={vi.fn()}
        resetSignal={0}
      />,
    );
    await waitFor(() =>
      expect(container.querySelector('altcha-widget')).not.toBeNull(),
    );
    const widget = widgetIn(container);
    // Mounting is not a reset.
    expect(widget.reset).not.toHaveBeenCalled();

    rerender(
      <AltchaWidget
        challengeUrl={CHALLENGE_URL}
        onToken={vi.fn()}
        resetSignal={1}
      />,
    );

    expect(widget.reset).toHaveBeenCalledTimes(1);
    expect(widget.verify).toHaveBeenCalledTimes(1);
  });
});
