import type {
  TrackerScriptEntry,
  TrackerScriptPlacement,
} from '@kometio/shared-types';
import { injectScriptNonce } from './content-security-policy';

export interface PartitionedTrackerScripts {
  // 'necessary' — always executed, same trust tier as themeHeadScript/
  // themeBodyScript (docs/adr/0039).
  ungated: TrackerScriptEntry[];
  gated: TrackerScriptEntry[];
}

export function partitionTrackerScripts(
  scripts: TrackerScriptEntry[],
  placement: TrackerScriptPlacement,
): PartitionedTrackerScripts {
  const forPlacement = scripts.filter((entry) => entry.placement === placement);
  return {
    ungated: forPlacement.filter((entry) => entry.category === 'necessary'),
    gated: forPlacement.filter((entry) => entry.category !== 'necessary'),
  };
}

export function renderUngatedScripts(
  entries: TrackerScriptEntry[],
  nonce: string,
): string {
  return entries.map((entry) => injectScriptNonce(entry.html, nonce)).join('');
}

/**
 * Wraps each entry's raw HTML in an inert `<template>` (docs/adr/0039) —
 * nothing inside is executed or fetched by the browser, including a
 * vendor's own `<noscript>`/`<img>` fallback beacon, not just its
 * `<script>` tags (the gap a `type="text/plain"` rewrite would leave).
 * Activated client-side by cookie-consent-bootstrap.ts once the matching
 * category is granted.
 */
export function renderGatedScripts(entries: TrackerScriptEntry[]): string {
  return entries
    .map(
      (entry) =>
        `<template data-kometio-consent="${entry.category}" data-kometio-id="${entry.id}">${entry.html}</template>`,
    )
    .join('');
}
