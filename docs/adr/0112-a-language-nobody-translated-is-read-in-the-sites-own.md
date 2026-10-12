# 0112 — A language nobody translated is read in the site's own language

**Status**: Accepted — 2026-10-12.

## Context

Core's UI strings exist in Italian and English. A site may enable any other
language (`LocaleSettings` has no fixed list), and a page in it still has
"Back to top", the cookie banner and the carousel's arrows to say. The
translator looked for a string in the locale, then its base language, then
**Italian**, then English: Italian first for every site, whatever the site was
written in. A site whose own language is English that enabled French showed
Italian buttons in the middle of an English page.

Three things stood in the way of the obvious fix:

- 53 block components and 10 other places (shared components, the layout,
  the search and error pages) each built their own translator from the
  locale (`new Translator(locale)`), several with their own spelling of "no
  locale" (`?? ''`, `?? 'it'`, `?? 'en'`). The site's language had nowhere to
  enter, and a fix there is 63 edits that each repeat the same two
  arguments.
- The captcha widget chose its language by a rule of its own (Italian or
  English, by the page's base language), which a fix to the translator would
  not have reached.
- A theme's own strings (`locales.json`) were resolved by a second copy of the
  chain.

## Decision

- **The chain is: the locale, its base language, the site's own language
  (with its base language), English.** A language the page is in and that has
  a dictionary always wins; the site's language only decides for one nobody
  translated. With no site to ask, the chain ends in English.
- **A translator is built once per rendered block, by `BlockRenderer`, from
  the page's locale and `site.defaultLocale`, and handed to the block as
  `i18n`** (`commonBlockProps`), as a theme's regions already receive one.
  A component does not build its own: `block-components.spec.ts` fails on
  `new Translator(` in a block, core's or a theme's.
- **`Translator.language` is the language the strings come out in**, for a
  widget that is not drawn by the translator and speaks only some languages:
  the captcha is told that one.
- **A theme's own dictionaries are bound to the same translator**
  (`i18n.withDictionaries(strings)`), so its words and core's cannot come out
  in different languages. `new DictionaryTranslator(locale, strings)` keeps
  working; with no site language it ends in English (it ended in Italian).
- The 404 and 500 pages, which can be drawn with no site at all, take the
  site's language as an optional prop and end in English without it.

## Alternatives not taken

- **The site's language as a second argument at every call site.** 63
  edits that each have to remember it, and the one that forgets is a page
  that is silently Italian again; with the translator injected, a block
  that does not receive one does not compile.
- **A request-scoped store read by the translator.** `theme-runtime` is
  imported by code that runs in the browser, which has no
  `AsyncLocalStorage`; and a store filled in by whichever component happens to
  render first depends on the order Astro renders in.

## Consequences

- A site whose language is English, with a language enabled that has no
  dictionary, now shows English in it; one whose language is Italian shows
  what it showed. A language with a dictionary is unaffected.
- A block component's props type has `i18n: Translator`, and `locale` only
  where it is also used for an address or a date.
- Checked on a built site against a stand-in API: the same French page on a
  site whose language is English (`Back to top`, `We use cookies`, `Days`,
  captcha `en`) and on one whose language is Italian (`Torna su`,
  `Utilizziamo i cookie`, `Giorni`, captcha `it`); an Italian page and an
  English page are in their own language on both.
- Not changed: the locale-less address (`/foo`) is still drawn as `it`, in
  its 404 — that is a choice of locale, not of fallback, and it is the
  product's.
