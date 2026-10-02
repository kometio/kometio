import { describe, expect, it } from 'vitest';
import type { TrackerScriptEntry } from '@kometio/shared-types';
import {
  partitionTrackerScripts,
  renderGatedScripts,
  renderUngatedScripts,
} from './consent-script-blocking';

const necessaryHead: TrackerScriptEntry = {
  id: 'a1',
  label: 'Necessary head thing',
  category: 'necessary',
  placement: 'head',
  html: '<script>console.log("necessary")</script>',
};
const analyticsHead: TrackerScriptEntry = {
  id: 'a2',
  label: 'Google Analytics',
  category: 'measurement',
  placement: 'head',
  html: '<script>gtag("config", "G-XXXX")</script>',
};
const pixelBody: TrackerScriptEntry = {
  id: 'a3',
  label: 'Meta Pixel',
  category: 'experience',
  placement: 'body',
  html: '<script>fbq("init", "123")</script>',
};

const entries: TrackerScriptEntry[] = [necessaryHead, analyticsHead, pixelBody];

describe('partitionTrackerScripts', () => {
  it('splits necessary (always-on) from every other category, for the given placement', () => {
    const head = partitionTrackerScripts(entries, 'head');

    expect(head.ungated).toEqual([necessaryHead]);
    expect(head.gated).toEqual([analyticsHead]);
  });

  it('filters out entries for the other placement', () => {
    const body = partitionTrackerScripts(entries, 'body');

    expect(body.ungated).toEqual([]);
    expect(body.gated).toEqual([pixelBody]);
  });

  it('returns empty arrays when nothing matches', () => {
    const result = partitionTrackerScripts([], 'head');

    expect(result).toEqual({ ungated: [], gated: [] });
  });
});

describe('renderUngatedScripts', () => {
  it('nonce-stamps every entry, same as injectScriptNonce', () => {
    const html = renderUngatedScripts([necessaryHead], 'abc123');

    expect(html).toBe(
      '<script nonce="abc123">console.log("necessary")</script>',
    );
  });
});

describe('renderGatedScripts', () => {
  it('wraps each entry in an inert template tagged with its category and id', () => {
    const html = renderGatedScripts([analyticsHead]);

    expect(html).toBe(
      '<template data-kometio-consent="measurement" data-kometio-id="a2"><script>gtag("config", "G-XXXX")</script></template>',
    );
  });

  it('does not nonce-stamp the inner script — activation does that client-side', () => {
    const html = renderGatedScripts([analyticsHead]);

    expect(html).not.toContain('nonce=');
  });

  it('joins multiple entries with no separator', () => {
    const html = renderGatedScripts([analyticsHead, pixelBody]);

    expect(html).toBe(
      '<template data-kometio-consent="measurement" data-kometio-id="a2"><script>gtag("config", "G-XXXX")</script></template>' +
        '<template data-kometio-consent="experience" data-kometio-id="a3"><script>fbq("init", "123")</script></template>',
    );
  });
});
