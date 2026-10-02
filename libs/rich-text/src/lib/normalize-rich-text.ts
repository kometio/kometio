import { ALLOWED_TAGS, sanitizeRichText } from './sanitize-rich-text';

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * A tag this product allows, opening or closing, anywhere in the value —
 * `<p>`, `</strong>`, `<br />`, `<a href="...">`. Built from the
 * sanitiser's own list so a tag can never be allowed by one and
 * unrecognised by the other.
 */
const ALLOWED_TAG_PATTERN = new RegExp(
  `<\\/?(?:${ALLOWED_TAGS.join('|')})\\b[^>]*>`,
  'i',
);

/**
 * Turns any stored value into valid, safe rich text — whether it already
 * is HTML or is a plain string written before `kind: 'richtext'` existed.
 *
 * Every one of the thirteen textarea fields held plain text until
 * ADR-0046, and plain text read back through `set:html` does not survive:
 * `Rossi & Figli` renders as `Rossi ` in some browsers and the rest is
 * eaten as an entity, and a line containing `<` loses everything after
 * it. A one-off migration script fixes the stored data — but scripts in
 * this repo are run by hand (`pnpm db:backfill-block-ids` and friends),
 * and a self-hoster who upgrades without running one would find their
 * site quietly missing text. So the READ path normalises too, and the
 * script becomes tidying rather than a precondition.
 *
 * The test for "is this already HTML" used to be whether the value
 * STARTS with a tag, and that was wrong in the common direction rather
 * than the rare one. A paragraph opening with a word and carrying markup
 * inside it — `Reach for this when <code>classic</code> is not enough` —
 * failed the test, so the whole string was escaped and the reader saw
 * the tags. It cost 246 of the 548 rich text values on this project's
 * own documentation site before anybody noticed, and the WordPress
 * importer would have walked into it next.
 *
 * The test is now whether the value contains a tag this product allows
 * anywhere in it, built from `ALLOWED_TAGS` so the two can never
 * disagree. `<` alone is not enough: `Costa < 10 euro` has no tag name
 * after it and stays the plain text it is.
 *
 * Still not a parser, and still has a misread — legacy plain text
 * containing something shaped like a tag (`a <b and c> d`) is sanitised
 * rather than escaped. That trade is deliberate: business copy written
 * before ADR-0046 is a sentence about prices and addresses, while
 * imperfect HTML from an importer is a certainty.
 *
 * Idempotent by construction, which is what lets it sit on both paths
 * and in the script: the escape branch wraps its output in `<p>`, so a
 * second pass finds a tag, takes the sanitise branch and changes
 * nothing.
 */
export function normalizeRichText(value: string): string {
  if (value.trim() === '') {
    return '';
  }
  if (ALLOWED_TAG_PATTERN.test(value)) {
    return sanitizeRichText(value);
  }
  return value
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '')
    .map(
      (paragraph) =>
        `<p>${escapeText(paragraph).split('\n').join('<br />')}</p>`,
    )
    .join('');
}
