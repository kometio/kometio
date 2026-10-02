/**
 * The themes' own fonts, self-hosted (docs/adr/0042 and its successor). A
 * theme that wants a font of its own declares a `fonts.css` in its
 * directory and takes the font package as a dependency — the same pattern
 * icons already use with `lucide-static`: a versioned package, never a CDN.
 *
 * No `<link>` to Google Fonts, ever: it would send every visitor's IP to
 * Google (a German court ruled on exactly that in 2022), which is
 * untenable for a product that sells "your data stays on your own
 * machine" and that generates the customer's privacy policy for them — and
 * an intranet deployment would not work at all.
 *
 * The import is eager and not filtered per theme, deliberately: every
 * bundled theme's `fonts.css` ends up in the stylesheet, but an
 * `@font-face` no rule references **downloads nothing** — it is inert by
 * construction, not by luck. That is worth it against the alternative
 * (injecting the CSS per request), because this way Vite rewrites the
 * `url()`s and bundles the font files, which a hand-written `@font-face`
 * in `theme.css` would never get.
 */
import.meta.glob('../../../../themes/*/fonts.css', { eager: true });
