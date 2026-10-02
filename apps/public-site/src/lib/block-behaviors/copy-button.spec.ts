// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyButtonBehaviors } from './copy-button';
import { runBlockBehaviors } from './run-block-behaviors';

function button(): HTMLButtonElement {
  const root = document.createElement('div');
  root.innerHTML = `<button type="button" data-kometio-copy-text="SUMMER10" data-kometio-copied-label="Copied" data-kometio-copy-failed-label="Could not copy"><span data-kometio-copy-label>Copy</span></button>`;
  document.body.append(root);
  const element = root.querySelector('button');
  if (!element) throw new Error('fixture has no button');
  return element;
}

describe('copy button', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('copies its text and says so on the button and to a screen reader, then goes back', async () => {
    vi.useFakeTimers();
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      value: execCommand,
      configurable: true,
    });
    const element = button();
    runBlockBehaviors(document, copyButtonBehaviors);

    element.click();
    await vi.waitFor(() => expect(execCommand).toHaveBeenCalledWith('copy'));

    const status = element.nextElementSibling;
    expect(element.textContent).toBe('Copied');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.textContent).toBe('Copied');

    vi.advanceTimersByTime(2000);
    expect(element.textContent).toBe('Copy');
    expect(status?.textContent).toBe('');
  });

  it('says it could not copy rather than claiming it did', async () => {
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn().mockReturnValue(false),
      configurable: true,
    });
    const element = button();
    runBlockBehaviors(document, copyButtonBehaviors);

    element.click();
    await vi.waitFor(() => expect(element.textContent).toBe('Could not copy'));
  });

  it('adds one live region and one listener however often behaviours re-run', () => {
    const element = button();
    runBlockBehaviors(document, copyButtonBehaviors);
    runBlockBehaviors(document, copyButtonBehaviors);

    expect(document.querySelectorAll('[aria-live]').length).toBe(1);
    expect(element.nextElementSibling?.nextElementSibling).toBeNull();
  });
});
