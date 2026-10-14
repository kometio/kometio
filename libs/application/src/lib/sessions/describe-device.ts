/**
 * What a person recognises their own devices by: "Chrome on macOS", not the
 * string the browser sends. Only this label is kept (docs/adr/0129), so a list
 * of sign-ins says where without keeping what a browser's fingerprint is made
 * of — the version, the model, the build — and without an address.
 *
 * What it does not recognise gives `null`, and the person is shown "Unknown
 * device": a stranger's header is never copied into a screen.
 */

/** The first that matches wins, so a browser built on another's engine comes before it. */
const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/\bEdg(?:A|iOS)?\//, 'Edge'],
  [/\bOPR\//, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/\b(?:Chrome|CriOS)\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
];

/** Likewise: a phone's agent says Linux and Mac OS X as well as what it is. */
const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bWindows\b/, 'Windows'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
];

/** Beyond this it is not a browser's header, and is not read. */
const MAX_LENGTH = 1024;

function firstMatch(
  agent: string,
  table: readonly (readonly [RegExp, string])[],
): string | null {
  return table.find(([pattern]) => pattern.test(agent))?.[1] ?? null;
}

export function describeDevice(userAgent: string | undefined): string | null {
  if (!userAgent || userAgent.length > MAX_LENGTH) return null;
  const browser = firstMatch(userAgent, BROWSERS);
  const system = firstMatch(userAgent, SYSTEMS);
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system;
}
