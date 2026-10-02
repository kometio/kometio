/*
 * How a key combination is written on this machine, for a tooltip, a card
 * or the hint in a search box.
 */

/**
 * Whether this machine spells the modifier ⌘ or Ctrl.
 *
 * `navigator.platform` is deprecated and `userAgentData` is not everywhere,
 * so it reads whichever it finds — and being wrong costs a wrong glyph in a
 * tooltip, not a broken shortcut: the handler itself accepts both
 * (`event.ctrlKey || event.metaKey`).
 */
function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const platform =
    (navigator as { userAgentData?: { platform?: string } }).userAgentData
      ?.platform ??
    navigator.platform ??
    navigator.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** "⌘Z" or "Ctrl+Z" — one string, for a tooltip or a card. */
export function formatShortcut(keys: readonly string[]): string {
  const apple = isApplePlatform();
  const spelled = keys.map((key) =>
    key === 'mod' ? (apple ? '⌘' : 'Ctrl') : key,
  );
  return apple ? spelled.join('') : spelled.join('+');
}
