import type { UploadedFontFace } from '@kometio/shared-types';

/** What a file's name says about the face it holds, so that the usual case needs no choosing. */
export function guessFontFace(
  filename: string,
): Pick<UploadedFontFace, 'weight' | 'style'> {
  const name = filename.toLowerCase();
  const style = /italic|oblique/.test(name) ? 'italic' : 'normal';
  if (/variable|\bvf\b|[-_.]vf[-_.]|wght|\[/.test(name)) {
    return { weight: 'variable', style };
  }
  const number = /(?:^|[^0-9])([1-9]00)(?:[^0-9]|$)/.exec(name)?.[1];
  if (number) {
    return { weight: weightOf(number), style };
  }
  // Longest first: "semibold" holds "bold", "extralight" holds "light".
  const words: [RegExp, UploadedFontFace['weight']][] = [
    [/extra-?light|ultra-?light/, '200'],
    [/semi-?bold|demi-?bold/, '600'],
    [/extra-?bold|ultra-?bold/, '800'],
    [/thin|hairline/, '100'],
    [/light/, '300'],
    [/medium/, '500'],
    [/black|heavy/, '900'],
    [/bold/, '700'],
  ];
  const found = words.find(([pattern]) => pattern.test(name));
  return { weight: found?.[1] ?? '400', style };
}

function weightOf(number: string): UploadedFontFace['weight'] {
  switch (number) {
    case '100':
    case '200':
    case '300':
    case '400':
    case '500':
    case '600':
    case '700':
    case '800':
    case '900':
      return number;
    default:
      return '400';
  }
}

/** Whether the name is one of the two web font containers; the server reads the bytes as well. */
export function isWebFontFileName(filename: string): boolean {
  return /\.(woff2?)$/i.test(filename);
}
