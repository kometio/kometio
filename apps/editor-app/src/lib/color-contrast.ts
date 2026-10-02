const AA_NORMAL_TEXT_RATIO = 4.5;

/**
 * A colour's LINEAR sRGB components (not gamma-corrected) — exactly what
 * the WCAG 2.1 relative luminance formula (§1.4.3) needs, since it weights
 * (0.2126, 0.7152, 0.0722) the linear-light channels, not the
 * gamma-compressed ones you see on screen.
 */
interface LinearRgb {
  r: number;
  g: number;
  b: number;
}

function srgbChannelToLinear(channel: number): number {
  return channel <= 0.03928
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

/**
 * The ONLY format the theme's primary/secondary colour field can ever
 * receive (`hexColorSchema` in shared-types) — the user always picks from
 * an `<input type="color">`.
 */
function parseHexToLinearRgb(hex: string): LinearRgb | null {
  const value = /^#([0-9a-fA-F]{6})$/.exec(hex)?.[1];
  if (value === undefined) return null;
  const channel = (offset: number) =>
    srgbChannelToLinear(parseInt(value.slice(offset, offset + 2), 16) / 255);
  return { r: channel(0), g: channel(2), b: channel(4) };
}

/**
 * The format the ACTIVE THEME declares `--primary-foreground`/
 * `--secondary-foreground` in today (see themes/classic/theme.css) — not a
 * general CSS parser, only this specific shape (`oklch(L C H)`, no alpha or
 * percentage units). The OKLCH -> OKLab -> LMS -> linear sRGB conversion
 * uses the matrices published by Björn Ottosson
 * (https://bottosson.github.io/posts/oklab/) — the same coefficients the
 * rest of the CSS Color 4 ecosystem uses (browsers, Culori, and so on).
 * It stops at LINEAR sRGB (it does not take the final gamma-encoding step
 * to "on-screen" sRGB): the WCAG luminance formula above wants exactly
 * that, so the extra step would only be computed to be undone again.
 */
function parseOklchToLinearRgb(color: string): LinearRgb | null {
  const match = color
    .trim()
    .match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i);
  if (!match) return null;
  const [, lStr, cStr, hStr] = match;
  const l = Number(lStr);
  const c = Number(cStr);
  const hueRadians = (Number(hStr) * Math.PI) / 180;

  const a = c * Math.cos(hueRadians);
  const b = c * Math.sin(hueRadians);

  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = l - 0.0894841775 * a - 1.291485548 * b;

  const lCubed = lPrime ** 3;
  const mCubed = mPrime ** 3;
  const sCubed = sPrime ** 3;

  return {
    r: 4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed,
    g: -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed,
    b: -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.707614701 * sCubed,
  };
}

function linearToSrgbChannel(channel: number): number {
  const clamped = Math.min(1, Math.max(0, channel));
  return clamped <= 0.0031308
    ? clamped * 12.92
    : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

/**
 * A colour a theme writes as `oklch(L C H)`, as the `#rrggbb` an
 * `<input type="color">` can hold — or `null` for anything else.
 *
 * The picker opens on the theme's own colour, and the classic theme writes
 * every colour in oklch: without this it opened on a neutral grey whatever
 * the theme showed. A colour outside sRGB lands on its nearest edge, which
 * is what a screen would show for it too.
 */
export function oklchToHex(color: string): string | null {
  const linear = parseOklchToLinearRgb(color);
  if (!linear) return null;
  const channel = (value: number) =>
    Math.round(linearToSrgbChannel(value) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(linear.r)}${channel(linear.g)}${channel(linear.b)}`;
}

function parseColorToLinearRgb(color: string): LinearRgb | null {
  return parseHexToLinearRgb(color) ?? parseOklchToLinearRgb(color);
}

function relativeLuminance({ r, g, b }: LinearRgb): number {
  // OKLCH conversion can land slightly outside [0, 1] for an out-of-sRGB-
  // gamut color (harmless here — clamping keeps the luminance formula
  // physically meaningful instead of producing a nonsensical negative).
  const clamp = (channel: number) => Math.min(1, Math.max(0, channel));
  return 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(b);
}

function contrastRatio(luminanceA: number, luminanceB: number): number {
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface ContrastCheckResult {
  passesAA: boolean;
  ratio: number;
}

/**
 * Compares the colour the user picked (always hex) against the active
 * theme's RESOLVED `--primary-foreground`/`--secondary-foreground` token
 * (always oklch today, see `resolve-theme-foreground-tokens.ts`) — not
 * against a fixed "black or white" assumption: that token is a FIXED value
 * for the whole theme, never recomputed from the chosen colour (unlike, for
 * instance, a tool that automatically picks light or dark text) — which is
 * exactly why an unreadable combination is possible here, and why the
 * comparison has to be against the theme's real value rather than a guess.
 *
 * Returns `null` (no check, no warning) when either colour is not in a
 * recognized format — it should not happen in practice (both come from
 * already-validated sources), but an incomplete custom theme or a future
 * different format must not break saving.
 */
export function checkContrastAgainstThemeForeground(
  backgroundHex: string,
  themeForegroundColor: string,
): ContrastCheckResult | null {
  const background = parseColorToLinearRgb(backgroundHex);
  const foreground = parseColorToLinearRgb(themeForegroundColor);
  if (!background || !foreground) return null;

  const ratio = contrastRatio(
    relativeLuminance(background),
    relativeLuminance(foreground),
  );
  return { passesAA: ratio >= AA_NORMAL_TEXT_RATIO, ratio };
}
