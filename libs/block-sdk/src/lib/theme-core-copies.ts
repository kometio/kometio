/**
 * A theme that replaces a core block (`blocks/<Type>.astro`) is a COPY of it,
 * with its own markup and styles, and core's fixes do not reach a copy: the
 * docs theme's Button once fell four props behind core's, and a button with an
 * icon simply had none on the docs site. A replacement is the theme's to
 * write (ADR-0021); what it should not be is out of step with core without
 * anybody having looked.
 *
 * So a theme records, per replacement, a fingerprint of the core file it was
 * last compared against, in `blocks/core-copies.json`. When core's file
 * changes the fingerprint no longer matches and the theme's spec fails,
 * naming the block: somebody reads core's change, ports what applies, and
 * records the new fingerprint. It does not say the copy is right — it says
 * that somebody has looked since core moved.
 *
 * Pure functions on texts, like `checkOverridesDrawVariants`: the spec of the
 * theme reads the files (`import.meta.glob(…, { query: '?raw' })`), so this
 * runs wherever the theme's own spec does.
 */

/** Block type → fingerprint of core's `<Type>.astro` as it was when the copy was last compared. */
export type CoreCopiesManifest = Readonly<Record<string, string>>;

export interface CoreCopyError {
  blockType: string;
  message: string;
}

/**
 * 64-bit FNV-1a of the text, line endings and trailing blanks aside. Not
 * cryptographic and not meant to be: it only has to change when the file
 * does, and to be the same on every machine, which a plain function of the
 * characters is (no Node `crypto`, so no environment can differ).
 */
export function fingerprintOf(source: string): string {
  const text = source.replace(/\r\n/g, '\n').trimEnd();
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Whether each replacement of a core block has been compared with the core
 * file as it is now.
 *
 * `overrideSources` is each of the theme's `.astro` by block type and
 * `coreSources` core's by block type; a type core does not ship is the theme's
 * own block and is no copy of anything.
 */
export function checkOverridesTrackCore(
  overrideSources: Readonly<Record<string, string>>,
  coreSources: Readonly<Record<string, string>>,
  manifest: CoreCopiesManifest,
): CoreCopyError[] {
  const copies = Object.keys(overrideSources).filter(
    (blockType) => blockType in coreSources,
  );
  const unrecorded = copies
    .filter((blockType) => !(blockType in manifest))
    .map((blockType) => ({
      blockType,
      message: `replaces core's ${blockType}.astro and does not say which version of it was compared: record it`,
    }));
  const behind = copies
    .filter(
      (blockType) =>
        blockType in manifest &&
        manifest[blockType] !== fingerprintOf(coreSources[blockType] ?? ''),
    )
    .map((blockType) => ({
      blockType,
      message: `core's ${blockType}.astro has changed since this copy was compared with it: read the change, bring over what applies, and record the new fingerprint`,
    }));
  const stale = Object.keys(manifest)
    .filter((blockType) => !copies.includes(blockType))
    .map((blockType) => ({
      blockType,
      message: `is in core-copies.json but this theme no longer replaces a core ${blockType}.astro: remove the entry`,
    }));
  return [...unrecorded, ...behind, ...stale];
}

/** The manifest that says every replacement was compared with core as it is now — what a review records. */
export function coreCopiesManifestFor(
  overrideSources: Readonly<Record<string, string>>,
  coreSources: Readonly<Record<string, string>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.keys(overrideSources)
      .filter((blockType) => blockType in coreSources)
      .sort()
      .map((blockType) => [
        blockType,
        fingerprintOf(coreSources[blockType] ?? ''),
      ]),
  );
}
