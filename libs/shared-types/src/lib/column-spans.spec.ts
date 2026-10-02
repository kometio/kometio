import { describe, expect, it } from 'vitest';
import type { Block } from './content-model';
import { columnsGridTemplate, resolveColumnSpans } from './content-model';

const column = (span?: number): Block => ({
  type: 'Column',
  props: span === undefined ? {} : { span },
});

describe('resolveColumnSpans', () => {
  it('splits the twelve tracks equally when no column asks for a width', () => {
    expect(resolveColumnSpans([column(), column()])).toEqual([6, 6]);
    expect(resolveColumnSpans([column(), column(), column()])).toEqual([
      4, 4, 4,
    ]);
  });

  it('gives the untouched columns what the explicit ones left over', () => {
    // The point of the default being "what is left" rather than a fixed
    // number: setting ONE column to 4 makes its neighbour 8 on its own,
    // with nothing to keep in sync by hand.
    expect(resolveColumnSpans([column(4), column()])).toEqual([4, 8]);
    expect(resolveColumnSpans([column(6), column(), column()])).toEqual([
      6, 3, 3,
    ]);
  });

  it('honours every explicit span when they all have one', () => {
    expect(resolveColumnSpans([column(3), column(9)])).toEqual([3, 9]);
  });

  it('never gives a column a zero track, even when the row is over-committed', () => {
    // A column with no track would render at zero width and its content
    // would simply be gone — worse than a cramped layout.
    expect(resolveColumnSpans([column(12), column()])).toEqual([12, 1]);
    expect(resolveColumnSpans([column(10), column(10), column()])).toEqual([
      10, 10, 1,
    ]);
  });

  it('ignores a span that is not a whole number in range, falling back to a share', () => {
    expect(resolveColumnSpans([column(0), column()])).toEqual([6, 6]);
    expect(resolveColumnSpans([column(13), column()])).toEqual([6, 6]);
    expect(
      resolveColumnSpans([{ type: 'Column', props: { span: '4' } }, column()]),
    ).toEqual([6, 6]);
  });

  it('has nothing to lay out for a row with no columns', () => {
    expect(resolveColumnSpans([])).toEqual([]);
    expect(resolveColumnSpans(undefined)).toEqual([]);
  });
});

describe('columnsGridTemplate', () => {
  it('emits fr tracks, which normalise whatever they are given', () => {
    expect(columnsGridTemplate([6, 6])).toBe('6fr 6fr');
    // Over twelve on purpose: `fr` divides proportionally rather than
    // overflowing, so an over-committed row compresses instead of
    // breaking out of its container.
    expect(columnsGridTemplate([10, 10])).toBe('10fr 10fr');
  });
});
