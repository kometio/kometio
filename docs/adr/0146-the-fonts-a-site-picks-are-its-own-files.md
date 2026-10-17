# 0146 — The fonts a site picks are its own files

**Status**: Accepted — 2026-10-17. Amends [0021](0021-site-theming-filesystem-packages-and-style-settings.md): no Google Fonts name, and no `<link>` to Google.

## Context

ADR-0021 let a site pick its font in Style from a short list, or type the name
of any Google Fonts family. Either way the public site wrote a `<link>` to
`fonts.googleapis.com` into every page, and every visitor's browser asked
Google for the stylesheet and `fonts.gstatic.com` for the files.

That request carries the visitor's address, their browser and the page they
are on, at every page view, before they have agreed to anything: the cookie
banner gates embeds and scripts, not a stylesheet in the head. Google does not
set a cookie for it, but an IP address is personal data, and a German court
fined a site for exactly this in 2022 (LG München I, 20 January 2022).
`docs/data-protection.md` listed it first among the things Kometio did not do
well, and the themes have been told for months never to link a font service
(`themes/README.md`). The core was the one place still doing it.

The owner chose the remedy: serve the curated fonts from the site itself,
drop the free-text name, and let a site upload a font of its own instead.

## Decision

- **Six fonts are files of the product.** Inter, Roboto, Poppins, Lora,
  Playfair Display and JetBrains Mono, in `apps/public-site/src/fonts/<font>/`,
  each with its licence (`OFL.txt`, SIL Open Font License 1.1) and a
  `fonts.css` that declares it. The files and their ranges come from
  Fontsource 5.3.0: the variable file where there is one (Poppins has none:
  400, 500, 600 and 700), upright and italic, the Latin subset and the
  accented letters of the rest of Europe.
- **Declared the way the themes' fonts are.** `theme-fonts.ts` imports every
  `fonts.css` eagerly, so Vite bundles the files under `/_astro/` with a hash
  in their names (kept by a browser for a year, `asset-cache-control.mjs`).
  An `@font-face` that no rule uses downloads nothing; a site that picks Lora
  sets `--font-sans-value: 'Lora', …` and its pages fetch the Lora files they
  need and nothing else. The cost of a family nobody picked is a few lines of
  stylesheet.
- **The field is a closed list.** `themeSettingsSchema.fontFamily` takes one
  of the curated values or `null`. A name stored before this change reads as
  `null` in the domain (`Site.themeFontFamily`), so a site that typed one goes
  back to its theme's font instead of to Google, and the next save clears it.
- **`system` is the system font.** It used to resolve to nothing at all, which
  made it the theme's font under another name. It is now
  `ui-sans-serif, system-ui, sans-serif`, and the editor names it in its own
  language ("System font", "Font di sistema") instead of always "Sistema".

## Consequences

- No page of a Kometio site asks a font service for anything. The Google
  Fonts row leaves `docs/data-protection.md`.
- The repository carries about 0.9 MB of font files. A visitor downloads only
  the files of the one family the site picked, and of those only the style,
  weight and letters a page uses.
- The editor's own preview in Style still draws with the name only: the editor
  is another origin and does not load the site's files. The canvas shows the
  real font, because it is the site.
- A site that had typed a Google Fonts name loses it. Nothing was published
  with one in this project; the cost is a choice to make again.
- Uploading a font of one's own is the other half of the owner's decision, and
  a change of its own.
