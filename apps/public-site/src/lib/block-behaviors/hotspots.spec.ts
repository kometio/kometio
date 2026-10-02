// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hotspotBehaviors } from './hotspots';
import { runBlockBehaviors } from './run-block-behaviors';

function picture(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'kometio-image-hotspots';
  root.innerHTML = [1, 2]
    .map(
      (n) =>
        `<details class="kometio-hotspot"><summary>Point ${n}</summary><div>Text ${n}</div></details>`,
    )
    .join('');
  document.body.append(root);
  return root;
}

const openStates = (root: HTMLElement) =>
  Array.from(root.querySelectorAll('details')).map((point) => point.open);

describe('hotspots', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps one point open at a time within a picture', () => {
    const root = picture();
    runBlockBehaviors(document, hotspotBehaviors);
    const [first, second] = Array.from(root.querySelectorAll('details'));
    if (!first || !second) throw new Error('fixture has no points');

    first.open = true;
    first.dispatchEvent(new Event('toggle'));
    second.open = true;
    second.dispatchEvent(new Event('toggle'));

    expect(openStates(root)).toEqual([false, true]);
  });

  it('leaves another picture’s point alone', () => {
    const one = picture();
    const two = picture();
    runBlockBehaviors(document, hotspotBehaviors);
    const inOne = one.querySelector('details');
    const inTwo = two.querySelector('details');
    if (!inOne || !inTwo) throw new Error('fixture has no points');

    inOne.open = true;
    inOne.dispatchEvent(new Event('toggle'));
    inTwo.open = true;
    inTwo.dispatchEvent(new Event('toggle'));

    expect(inOne.open).toBe(true);
  });

  it('closes on Escape and gives focus back to the point', () => {
    const root = picture();
    runBlockBehaviors(document, hotspotBehaviors);
    const point = root.querySelector('details');
    if (!point) throw new Error('fixture has no point');
    point.open = true;

    point.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    expect(point.open).toBe(false);
    expect(document.activeElement).toBe(point.querySelector('summary'));
  });

  it('closes when the visitor clicks anywhere outside the points', () => {
    const root = picture();
    runBlockBehaviors(document, hotspotBehaviors);
    const point = root.querySelector('details');
    if (!point) throw new Error('fixture has no point');
    point.open = true;

    document.body.click();

    expect(point.open).toBe(false);
  });

  it('listens for clicks on the document once, however often the pictures are wired again', () => {
    const added = vi.spyOn(document, 'addEventListener');
    picture();
    runBlockBehaviors(document, hotspotBehaviors);
    // A canvas re-render: the same picture, new elements, wired again.
    document.body.innerHTML = '';
    picture();
    runBlockBehaviors(document, hotspotBehaviors);

    const clickListeners = added.mock.calls.filter(
      ([type]) => type === 'click',
    );
    expect(clickListeners.length).toBeLessThanOrEqual(1);
    added.mockRestore();
  });
});
