// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyButtonBehaviors, initCopyButtons } from './copy-button';
import { runBlockBehaviors } from './run-block-behaviors';

const REPO = join(import.meta.dirname, '../../../../..');

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

describe('a button that copies what is already on the page', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function sample(): HTMLButtonElement {
    document.body.innerHTML = `
      <div class="kometio-code">
        <div class="bar"><button type="button" data-kometio-copy-from="pre"><span data-kometio-copy-label>Copy</span></button></div>
        <div><pre><code><span>npm install</span>\n<span>npm run build</span></code></pre></div>
      </div>
      <div class="kometio-code"><pre><code>another sample</code></pre></div>`;
    const element = document.querySelector('button');
    if (!element) throw new Error('fixture has no button');
    return element;
  }

  it('copies the text of the nearest sample, line breaks and all, without the page saying it twice', async () => {
    // The old route's textarea is in the page for the moment it is asked to
    // copy, which is when its text can be read.
    let copied = '';
    const execCommand = vi.fn(() => {
      copied = document.querySelector('textarea')?.value ?? '';
      return true;
    });
    Object.defineProperty(document, 'execCommand', {
      value: execCommand,
      configurable: true,
    });
    const element = sample();

    initCopyButtons();
    element.click();

    await vi.waitFor(() => expect(execCommand).toHaveBeenCalledWith('copy'));
    expect(copied).toBe('npm install\nnpm run build');
  });

  it('is wired by the page, for any block that carries the markup', () => {
    const element = sample();

    initCopyButtons();

    expect(element.hasAttribute('data-kometio-copy-initialized')).toBe(true);
    expect(element.nextElementSibling?.getAttribute('aria-live')).toBe(
      'polite',
    );
  });
});

/**
 * The contract is the markup, and a theme's override of the Code block is a
 * copy of core's (docs/adr/0021): nothing but this keeps the copy from losing
 * the button the day core's changes, or from growing a script of its own that
 * wires it a second time.
 */
describe('the Code block, core and the docs theme', () => {
  const files = {
    core: 'apps/public-site/src/components/blocks/Code.astro',
    'docs-showcase': 'themes/docs-showcase/blocks/Code.astro',
  };

  for (const [name, path] of Object.entries(files)) {
    it(`${name}: has a button that copies the sample's own text, said in the site's language`, () => {
      const source = readFileSync(join(REPO, path), 'utf8');

      expect(source).toContain('data-kometio-copy-from="pre"');
      expect(source).toContain("i18n.t('code.copy')");
      expect(source).toContain("i18n.t('copyButton.copied')");
      expect(source).toContain("i18n.t('copyButton.failed')");
      expect(source).toContain('<span data-kometio-copy-label>');
    });

    it(`${name}: carries no script of its own — the page wires the button`, () => {
      const source = readFileSync(join(REPO, path), 'utf8');

      expect(source).not.toMatch(/<script[\s>]/);
    });
  }
});
