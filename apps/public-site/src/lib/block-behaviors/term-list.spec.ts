// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isPlainActivation, swapRegions } from './term-list';

function documentWith(body: string): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><head><title>Archive</title></head><body>${body}</body></html>`,
    'text/html',
  );
}

const page = (label: string, items: string) => `
  <nav data-kometio-term-list="filter"><a href="?term=a">${label}</a></nav>
  <div data-kometio-grid><ul>${items}</ul></div>
`;

describe('swapRegions', () => {
  it('puts the incoming lists and controls in place of the current ones', () => {
    document.body.innerHTML = page('all', '<li>one</li><li>two</li>');
    const incoming = documentWith(page('dogs', '<li>one</li>'));

    expect(swapRegions(document, incoming)).toBe(true);
    expect(document.querySelectorAll('li')).toHaveLength(1);
    expect(document.querySelector('nav a')?.textContent).toBe('dogs');
  });

  it('takes the incoming title too, so the tab says what is on screen', () => {
    document.body.innerHTML = page('all', '<li>one</li>');
    const incoming = documentWith(page('dogs', '<li>one</li>'));
    incoming.title = 'Dog food — Archive';

    swapRegions(document, incoming);

    expect(document.title).toBe('Dog food — Archive');
  });

  it('refuses a page with a different set of regions rather than patching half of it', () => {
    document.body.innerHTML = page('all', '<li>one</li>');
    const incoming = documentWith('<div data-kometio-grid><ul></ul></div>');

    expect(swapRegions(document, incoming)).toBe(false);
    // Untouched: the caller lets the browser navigate instead.
    expect(document.querySelectorAll('li')).toHaveLength(1);
  });

  it('refuses when this page has no regions at all', () => {
    document.body.innerHTML = '<p>a page with no archive on it</p>';
    expect(swapRegions(document, documentWith(page('all', '')))).toBe(false);
  });
});

describe('isPlainActivation', () => {
  it('answers a plain left click', () => {
    expect(isPlainActivation(new MouseEvent('click', { button: 0 }))).toBe(
      true,
    );
  });

  it.each([
    ['middle click', { button: 1 }],
    ['command', { button: 0, metaKey: true }],
    ['control', { button: 0, ctrlKey: true }],
    ['shift', { button: 0, shiftKey: true }],
    ['alt', { button: 0, altKey: true }],
  ])(
    'leaves %s to the browser, which is what the reader asked for',
    (_, init) => {
      expect(isPlainActivation(new MouseEvent('click', init))).toBe(false);
    },
  );
});
