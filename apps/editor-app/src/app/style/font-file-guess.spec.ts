import { describe, expect, it } from 'vitest';
import { guessFontFace, isWebFontFileName } from './font-file-guess';

describe('guessFontFace', () => {
  it.each([
    ['Biscotto-Regular.woff2', '400', 'normal'],
    ['Biscotto-Italic.woff2', '400', 'italic'],
    ['Biscotto-Bold.woff2', '700', 'normal'],
    ['Biscotto-BoldItalic.woff2', '700', 'italic'],
    ['Biscotto-SemiBold.woff2', '600', 'normal'],
    ['Biscotto-ExtraLight.woff', '200', 'normal'],
    ['Biscotto-Light.woff2', '300', 'normal'],
    ['biscotto-latin-500-normal.woff2', '500', 'normal'],
    ['Biscotto[wght].woff2', 'variable', 'normal'],
    ['Biscotto-Italic-VF.woff2', 'variable', 'italic'],
    ['biscotto-latin-wght-italic.woff2', 'variable', 'italic'],
    ['font.woff2', '400', 'normal'],
  ])('%s is %s, %s', (name, weight, style) => {
    expect(guessFontFace(name)).toEqual({ weight, style });
  });
});

describe('isWebFontFileName', () => {
  it('takes WOFF2 and WOFF, and nothing else', () => {
    expect(isWebFontFileName('a.woff2')).toBe(true);
    expect(isWebFontFileName('a.WOFF')).toBe(true);
    expect(isWebFontFileName('a.ttf')).toBe(false);
    expect(isWebFontFileName('a.otf')).toBe(false);
    expect(isWebFontFileName('woff2.zip')).toBe(false);
  });
});
