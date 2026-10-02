# 0090 — A missing theme icon is flagged in the editor

**Status**: Accepted — 2026-09-27

## Context

A theme that ships its own `icons/` uses only that set (ADR-0023's binary
rule): no fallback to Lucide for a name it lacks. A page can still hold such
a name — picked under another theme, or under an older version of this one —
and the site then draws nothing for it:

- an Icon block renders nothing at all, and on the canvas it looks exactly
  like one with no icon chosen;
- a Feature, a Button or a NavLink loses its icon and keeps its text;
- a List set to icon markers has no mask image, so its markers turn into
  plain squares.

Nothing said why. ADR-0023 accepted this "until it bites someone", and a
theme kept in its own repository (ADR-0089) makes it likely: a site that
switches to an agency's theme keeps every icon it chose before.

Falling back to Lucide for the missing names was considered and rejected:
it would put an icon from another family into a theme that chose its own,
and the result would look like a mistake of the theme's.

## Decision

- **The rule stays binary.** A theme's set is the whole set; nothing is
  merged in.
- **The editor says which blocks are affected**, in two places:
  - the **Layers** panel marks the row of each block whose icon the theme
    lacks, with the missing names in the row's accessible name. A collapsed
    row marks itself when a block it hides is affected, or the only rows
    that could tell you would be the ones you cannot see;
  - the **icon field** in the inspector names the missing icon under its
    controls, where the other one gets chosen.
- **The picker offers only the theme's set.** It already did: its
  interface tab lists what `GET /api/themes/current/icons` returns for the
  site's theme.
- **Only an interface icon can be missing.** A `brand:` logo and a
  `media:` image are the same under every theme (`iconSource()` in
  shared-types says which is which).
- **Only a shown field counts**, by the same `isFieldVisible` the inspector
  uses: a List whose marker is not an icon keeps an `icon` prop and draws
  nothing with it.
- **Nothing is flagged while the set is loading.** A warning that flashes
  on every page while a request is in flight is one people learn to ignore.

The check runs in the editor, against the set it already loads for the
picker (`findMissingThemeIcons`, `apps/editor-app/src/app/style/missing-theme-icons.ts`),
over every icon field of every descriptor — core or theme, whatever the
field's key — at every depth of the tree.

## Consequences

- A marker on the canvas itself was considered and left out: it would add a
  label inside the preview, in navigation bars and rows of buttons, for
  something the two panels already say.
- The warning covers what is open in the editor. Nothing yet tells you, at
  the moment you switch themes, how many pages hold an icon the new theme
  lacks; that would need a scan of every page and section, and waits for a
  real need.
