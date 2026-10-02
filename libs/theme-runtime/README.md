# @kometio/theme-runtime

The runtime surface a Kometio theme codes against. It exists so a theme does
not have to import from `apps/public-site` — which is what used to make a
theme impossible to develop outside this monorepo.

Zero dependencies, on purpose: everything here is either a pure function,
two JSON dictionaries, or a type.

| Export                                                                                                   | What it is                                                                                             |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `localePath`, `localePathFromAncestors`, `localeDirection`                                               | The URL convention for a (locale, slug) pair, and LTR/RTL for a locale (docs/adr/0017, docs/adr/0029). |
| `Translator`, `TranslationKey`                                                                           | Core's own UI dictionary (EN/IT), bound to one locale. A region receives one ready-made as `i18n`.     |
| `ThemeRegionProps`, `ThemeHeaderProps`, `ThemeFooterProps`, `ThemeContentShellProps`, `ThemeRegionRoute` | The props contract for `themes/<name>/regions/*.astro`.                                                |
| `PageTreeNodeDto`                                                                                        | One published page as `ThemeRegionProps.pageTree()` resolves it.                                       |
| `KometioThemeLocals`                                                                                     | What core puts on `Astro.locals` — today, the icon resolver.                                           |

## `Astro.locals`

Some things cannot be a package. The icon registry is an eager
`import.meta.glob` over `themes/<name>/icons/` plus `lucide-static`
resolved through `import.meta.resolve` — all of it apps/public-site's.
Rather than have a theme import it (the exact coupling this package
removes), core hands it over per request. A theme opts into the typing
with one line in its own `env.d.ts`:

```ts
/// <reference types="@kometio/theme-runtime/locals" />
```

and then calls it with no import at all:

```astro
const globe = Astro.locals.resolveIcon('globe', site.themeName);
```

For an icon the **editor's user** picked on a block that has an icon field,
don't call this: core already resolved it and passes it down as `iconSvg`.

## Why `Translator` lives here and not in the app

A theme's own markup needs the same strings core's does — "skip to
content", the language switcher's label, the cookie banner's copy. Those
dictionaries are small (74 lines each) and have no dependencies, so
shipping them is cheaper than inventing a second mechanism for a theme to
translate its own chrome.

Strings that belong to _one theme_ (docs-showcase's `docs.*` and
`docsPagination.*` keys) are still in here, which is wrong — core should
not carry a theme's vocabulary. The fix is `themes/<name>/locales/<lang>.json`,
following the precedent `blocks/*.locales.json` already set for ADR-0041.
It is deliberately deferred until a second theme wants strings of its own.
