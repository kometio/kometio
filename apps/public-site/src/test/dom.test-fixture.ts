/**
 * `value` as an instance of `type`, or an error that says what it was.
 *
 * What a spec wrote as `screen.getByLabelText('Name') as HTMLInputElement`:
 * the query hands back an `HTMLElement` and the spec knows it is an input. The
 * cast assumed it; this checks it, so that a label that moved onto something
 * else fails here, naming it, and not three lines later as "value is
 * undefined".
 */
export function instanceOf<T>(
  value: unknown,
  type: new (...args: never[]) => T,
  what = 'the element',
): T {
  if (value instanceof type) return value;
  const found =
    value === null || value === undefined
      ? String(value)
      : (value.constructor?.name ?? typeof value);
  throw new Error(`${what} is a ${found}, not a ${type.name}`);
}

/** The window of a frame that has loaded; an error, and not `null`, when it has not. */
export function windowOf(frame: HTMLIFrameElement): Window {
  const { contentWindow } = frame;
  if (contentWindow === null) {
    throw new Error('the frame has no window yet: it has not loaded');
  }
  return contentWindow;
}

/** A box, with everything a `DOMRect` has: what `getBoundingClientRect` is made to answer in a spec. */
export function rect(box: {
  top?: number;
  left?: number;
  width?: number;
  height?: number;
}): DOMRect {
  const { top = 0, left = 0, width = 0, height = 0 } = box;
  return {
    x: left,
    y: top,
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({ x: left, y: top, width, height }),
  };
}
