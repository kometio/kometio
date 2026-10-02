import { describe, expect, it } from 'vitest';
import { detectKnownTrackers } from './tracker-signature-detector';

describe('detectKnownTrackers', () => {
  it('returns everything as remainingHtml when nothing is recognized', () => {
    const html = '<script>console.log("custom widget")</script>';

    const result = detectKnownTrackers(html);

    expect(result.detected).toEqual([]);
    expect(result.remainingHtml).toBe(html);
  });

  it('extracts a Google Tag Manager snippet (the real one-tag form, script.src built at runtime)', () => {
    const gtm =
      '<script>(function(w,d,s,l,i){w[l]=w[l]||[];var j=d.createElement(s);j.async=true;j.src="https://www.googletagmanager.com/gtm.js?id="+i;d.body.appendChild(j);})(window,document,"script","dataLayer","GTM-XXXX");</script>';

    const result = detectKnownTrackers(gtm);

    expect(result.detected).toHaveLength(1);
    expect(result.detected[0]?.vendor).toBe('Google Tag Manager');
    expect(result.detected[0]?.category).toBe('measurement');
    expect(result.remainingHtml).toBe('');
  });

  it('extracts a GA4 snippet by its gtag(config...) call', () => {
    const ga4 =
      '<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script><script>gtag("config", "G-XXXX");</script>';

    const result = detectKnownTrackers(ga4);

    expect(result.detected.map((entry) => entry.vendor)).toEqual([
      'Google Analytics (GA4)',
      'Google Analytics (GA4)',
    ]);
    expect(result.remainingHtml).toBe('');
  });

  it('extracts a Meta Pixel snippet, tagged as experience', () => {
    const pixel =
      '<script>!function(f,b){f.fbq=f.fbq||function(){};}(window);fbq("init", "123456");fbq("track", "PageView");</script>';

    const result = detectKnownTrackers(pixel);

    expect(result.detected).toHaveLength(1);
    expect(result.detected[0]?.vendor).toBe('Meta Pixel');
    expect(result.detected[0]?.category).toBe('experience');
  });

  it('leaves an unrecognized script tag in remainingHtml and keeps document order', () => {
    const html =
      '<script>console.log("before")</script><script>gtag("config", "G-XXXX")</script><script>console.log("after")</script>';

    const result = detectKnownTrackers(html);

    expect(result.detected).toHaveLength(1);
    // A single space where the removed match was, not nothing — see
    // detectKnownTrackers's own doc comment for why deleting to '' is
    // unsafe.
    expect(result.remainingHtml).toBe(
      '<script>console.log("before")</script> <script>console.log("after")</script>',
    );
  });

  it('does not extract a noscript fallback (documented limitation)', () => {
    const noscript =
      '<noscript><img src="https://www.facebook.com/tr?id=123&ev=PageView&noscript=1" /></noscript>';

    const result = detectKnownTrackers(noscript);

    expect(result.detected).toEqual([]);
    expect(result.remainingHtml).toBe(noscript);
  });

  it('returns an empty string for empty input', () => {
    const result = detectKnownTrackers('');

    expect(result.detected).toEqual([]);
    expect(result.remainingHtml).toBe('');
  });

  it('extracts a recognized snippet even when its closing tag has arbitrary content before ">" (CodeQL js/incomplete-html-attribute-sanitization-2)', () => {
    const gtm = '<script data-x>gtag("config", "G-XXXX")</script\t\n bar>';

    const result = detectKnownTrackers(gtm);

    expect(result.detected).toHaveLength(1);
    expect(result.remainingHtml).toBe('');
    // The regression this guards against: a closing-tag pattern that only
    // matches the literal `</script>` (or just whitespace before `>`)
    // leaves a bare, unclosed `<script` fragment in remainingHtml when it
    // doesn't — which is later re-injected into the page via `set:html`
    // in PageLayout.astro.
    expect(result.remainingHtml).not.toContain('<script');
  });

  it('does not let a removed match splice its leftovers into a new one (CodeQL js/incomplete-multi-character-sanitization)', () => {
    // Deleting only the inner, complete `<script>...</script>` to '' would
    // splice "<scri" + "pt>" back into a literal, never-there-before
    // "<script>" — the classic single-pass sanitizer bug. A fixed-point
    // retry loop alone would NOT catch this: the reconstructed "<script>"
    // has no matching close tag anywhere in the string, so it can never
    // become a match on a later pass either. Only replacing with a
    // non-empty separator (a space) prevents the splice from ever forming
    // a tag-like sequence in the first place.
    const adversarial = '<scri<script>gtag("config", "G-XXXX")</script>pt>';

    const result = detectKnownTrackers(adversarial);

    expect(result.detected).toHaveLength(1);
    expect(result.remainingHtml).toBe('<scri pt>');
    expect(result.remainingHtml).not.toContain('<script');
  });
});
