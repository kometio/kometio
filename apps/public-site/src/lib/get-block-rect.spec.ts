// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBlockRect } from './get-block-rect';

describe('getBlockRect', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("measures via a Range over the element's content, not the element's own getBoundingClientRect", () => {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'contents';
    document.body.append(wrapper);

    // display:contents always reports an empty rect natively — stub it to
    // prove getBlockRect never relies on it. jsdom doesn't implement
    // Range.getBoundingClientRect at all, so it's assigned directly rather
    // than spied on (spyOn requires the method to already exist).
    wrapper.getBoundingClientRect = vi.fn(
      () => ({ top: 0, left: 0, width: 0, height: 0 }) as DOMRect,
    );
    const rangeRect = vi.fn(
      () => ({ top: 10, left: 20, width: 300, height: 40 }) as DOMRect,
    );
    Range.prototype.getBoundingClientRect = rangeRect;

    const result = getBlockRect(wrapper);

    expect(result).toEqual({ top: 10, left: 20, width: 300, height: 40 });
    expect(rangeRect).toHaveBeenCalled();
    expect(wrapper.getBoundingClientRect).not.toHaveBeenCalled();
  });

  it('selects the node contents of the exact element passed in', () => {
    const el = document.createElement('span');
    document.body.append(el);
    const selectSpy = vi.spyOn(Range.prototype, 'selectNodeContents');
    Range.prototype.getBoundingClientRect = vi.fn(
      () => ({ top: 0, left: 0, width: 0, height: 0 }) as DOMRect,
    );

    getBlockRect(el);

    expect(selectSpy).toHaveBeenCalledWith(el);
  });
});
