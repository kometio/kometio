# 0133 — A block bridges its properties with one line, and the contract says what they start from

**Status**: Accepted — 2026-10-14. Builds on
[0022](0022-component-and-instance-style-overrides.md) (the override
properties) and [0115](0115-a-block-is-declared-once-as-a-contract.md) (the
contract's `style`).

## Context

A block's own stylesheet "bridges" a property: `background:
var(--kometio-override-bg, transparent)` lets the Style dialog, a site-wide
override or a single instance repaint it, and says what it is when nobody has.
Every stylable block wrote that by hand, and its fallback was written a second
time in its contract's `style`, where the editor reads it to show the field's
placeholder.

Counted on 2026-10-14: 104 of the 116 blocks wrote it, 452 declarations in all.
Of the 394 defaults that stand on a block's own root class, 391 were equal to
the contract's. The three that were not: `Button`'s two paddings (it reads the
theme's own button variables on purpose) and `ArticleMeta`'s text colour — the
contract said `inherit` and the page rendered `var(--muted-foreground)`, so the
field in the Style dialog showed one default while a visitor saw another. It is
the same fact written in two places, and it had begun to differ.

The TODO's answer (ENG-2) was a shared stylesheet that maps the common
variables. [PR #101](https://github.com/kometio/kometio/pull/101) looked at that
and did not do it: the block's rule is scoped and unlayered, a global sheet is
not, so it either changes who wins against a theme's own rules or carries a
specificity hack, and it is paid on every page. This is what was chosen instead.

## Decision

- **A block says which of its properties are the dialog's, and nothing else.**
  In its own `<style>`:

  ```css
  .kometio-quote {
    @kometio-bridge background color border-radius padding;
  }
  ```

  A PostCSS step of the public site's build (`apps/public-site/block-bridge.mjs`,
  in `vite.css.postcss.plugins`) writes the declarations before anything else
  reads the stylesheet: the name of each custom property is
  `BLOCK_STYLE_CUSTOM_PROPERTIES`'s and the fallback is the block's contract
  `style`. The property is named by what it sets (`background`, `color`,
  `border-radius`, `padding` — which is the vertical and the horizontal —,
  `border-width`, `border-style`, `border-color`, `box-shadow`, `gap`,
  `max-width`, `min-height`), so there is no vocabulary of ours to learn.

- **The contract is the only place a default is written.** The block type is the
  stylesheet's file name, as it already is everywhere (`Quote.astro` is `Quote`).
  A property the contract does not declare is a build error that names the
  block and the key: the same rule ADR-0116 made for the editor ("a block cannot
  offer a property it has no default for"), now holding for the page as well.
- **What comes out is what a block wrote by hand.** The declaration is scoped by
  Astro's compiler as before (the directive reaches the plugin inside
  `.kometio-quote[data-astro-cid-…]`), unlayered, at the same specificity, in the
  same place of the rule. A theme's own rules win and lose exactly as they did.
  Nothing is shipped that was not shipped, and nothing is computed per request.
- **A declaration is bridged only if it was equal to the default.** A fallback
  that differs on purpose (an inner element, a variant, a value that comes from
  a theme variable) stays written, and is a visible exception instead of a
  second copy that happens to agree. `block-bridge.spec.ts` fails on a
  declaration that says by hand what the directive would say, so the line is not
  something to forget to use.
- **ArticleMeta's contract is corrected to what the page renders**
  (`var(--muted-foreground)`). The page does not change; the field now shows the
  default a visitor sees.

## How it was proven

A change of how a block's CSS is written is a change nothing but a measurement
can vouch for, so it was measured twice, each independent of the other:

- **Every stylesheet, exhaustively.** For the 109 `<style>` blocks of the 116
  block components, the stylesheet before and the one after the plugin has
  expanded it were reduced to the ordered list of selector and declaration and
  compared: identical in all of them.
- **What a visitor sees.** `apps/e2e/tools/block-style-snapshot.mts` (PR #101):
  the computed style of 4,840 elements of a page of every block, in both themes,
  at desktop and phone width, with the defaults and with every override set,
  before and after against a built site: identical.
- The plugin also runs in `astro dev` (the style module is served expanded), and
  the production build contains no `@kometio-bridge`.

## Not in this change

- **The 32 declarations whose fallback is not the contract's (or that the
  contract has no default for) stay by hand**, and so does any property outside
  the list above (`padding-block`, `background-color`,
  `background-image` with an overlay, `border:` as a shorthand, `align-items`).
  What a theme variable feeds (`Button`'s and `Hero`'s padding, `Container`'s
  padding and colour) is a decision of those blocks, and they say so in their
  own comments. The directive is for the case it describes, which is most of them.
- **`Link`'s colour** reads `var(--link, var(--primary))` while its contract
  says `var(--primary)`. The editor resolves only a single `var(--x)` against the
  theme (`resolveDefaultStyleExpression`), so the contract cannot say the
  nested form; it is left as a known difference rather than made to print a raw
  expression in the dialog.
- **`PageGrid` and `TermList` bridge a border their contract does not offer.**
  The page honours an override of it and the dialog does not show one. Declaring
  the three defaults adds three fields to those blocks' dialogs: that is a
  product decision about the editor, not a step in this one.
- **A theme's own blocks** keep writing `var(--kometio-override-*, …)`
  themselves, as ADR-0022 describes. A theme's copy of a core block has the core
  type and could use the directive; a block of a new type has no core contract,
  and the build says so, naming it. The four copies in `themes/docs-showcase`
  (`Button`, `Code`, `Hero`, `LanguageSwitcher`) were compared with core's change,
  which is these declarations and nothing else, and re-recorded.

## Consequences

- A new stylable block says its properties in one line and its defaults once, in
  the contract. `libs/block-registry/README.md` has the step.
- Changing a contract's `style` changes the page, which it did not before: the
  dev server has to be restarted for it to be read (it is read when the config
  loads). A build always reads it.
- The language server of an editor flags an at-rule it does not know. The
  repository's `.vscode/settings.json` turns that one warning off for CSS.
- Roughly 350 lines are gone from the blocks, and the 31 blocks that are left
  with a hand-written reference to an override variable are the exceptions above.
