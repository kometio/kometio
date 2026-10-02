/**
 * `KOMETIO_THEME=classic,docs-showcase` narrows which of the themes a
 * deployment carries it will actually offer and serve; empty or unset
 * means all of them (docs/adr/0042).
 *
 * Lives here, and not next to either consumer, because BOTH sides have
 * to answer the question the same way: apps/public-site decides what it
 * will render, and apps/api decides what the editor's theme picker
 * offers. When only one of them applied the list, the picker showed
 * themes that then rendered as the fallback — an allow-list that allowed
 * nothing (ADR-0069).
 *
 * An allow-list naming nothing that is actually present — a typo, or a
 * theme dropped from a later release — degrades back to "everything"
 * rather than leaving the deployment with no theme at all.
 */
export function applyThemeAllowList(
  namesOnDisk: readonly string[],
  rawAllowList: string | undefined,
): readonly string[] {
  const allowed = (rawAllowList ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => namesOnDisk.includes(name));
  return allowed.length > 0 ? allowed : namesOnDisk;
}
