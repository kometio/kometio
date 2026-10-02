# 0031 — Admin-managed tracker domain whitelist, and a curated locale picklist

**Status**: Accepted — 2026-08-29

## Context

`content-security-policy.ts` hardcodes an allowlist for exactly three trackers (GTM, GA4, Meta Pixel) — the only ones requested so far. Flagged 2026-08-28 as unsustainable: every future tracker (LinkedIn Insight, TikTok Pixel, Hotjar, Intercom, ...) would mean another hardcoded vendor entry and a code deploy. A site owner already has unrestricted script execution via the existing Tier 1 `headScript`/`bodyScript` fields (docs/adr/0021's own stated trust model) — letting them also whitelist a domain for CSP doesn't lower security below what already exists.

Separately, `locale-list-editor.tsx` accepts any free-text string of 2+ characters as a locale code, by original deliberate design (an agency's own naming convention is theirs to pick). Flagged 2026-08-29 as a real gap once `isRtlLocale` started deriving RTL/LTR behavior from the locale's language subtag: a typo'd or non-standard code (`'ita'`, `'ENG'`) silently gets treated as LTR with no warning, and there's no requested-by-user reason left not to constrain new entries to well-formed codes.

Both were bundled into one session at the user's request; they share no code, but both touch the editor-app's site-settings surface.

## Decision

### Tracker whitelist: one whitelist entry = one bare domain, applied to a fixed set of directives, no per-vendor presets

`themeSettingsSchema` (`libs/shared-types/site-theme-settings.ts`) gains `allowedTrackerDomains: TrackerDomainEntry[]` (`{ label, domain }`, capped at 20, `domain` validated as a bare hostname with an optional `*.` wildcard prefix — no scheme, no path). Each domain is applied automatically to `script-src`, `connect-src`, and `frame-src` — not `img-src`/`font-src`/`style-src`, which this policy already leaves wildcarded to any `https:` origin, so adding a specific domain there would be strictly redundant (verified by reading the existing policy, not assumed). The admin doesn't pick directives one at a time: given the trust model above, per-directive granularity would add form complexity without lowering real risk.

Entry is fully manual (label + domain typed by the admin) — no curated per-vendor presets (LinkedIn/TikTok/Hotjar/...). A presets list would need its own ongoing maintenance as vendors change infrastructure, for a convenience win judged not worth it yet; can be layered on later without a schema change if it becomes worth it.

The DB column (`sites.theme_allowed_tracker_domains`, `jsonb`, default `[]`) follows the same pattern as the pre-existing `sites.opening_hours` column — a small, site-scoped, bounded JSON array — rather than a new child table, since 20 entries max never needs its own indexed queries.

### Head/body script fields move out of the "Stile" page into a new "Integrazioni" page, alongside the whitelist

`StyleView` (the "Stile" sidebar page) kept `headScript`/`bodyScript` since docs/adr/0021 introduced Tier 1 theming, gated behind the same `overridesEnabled` switch as colors/font/customCss. Third-party scripts and the domains they need to talk to are one concern, not "style" — the user's own framing during scoping — so both move to a new top-level `IntegrationsView` (`/integrations`), which does NOT gate them behind `overridesEnabled`: a tracker script has no reason to stop running just because someone toggled off color/font overrides, which was really an accidental coupling from sharing one endpoint/switch, not a deliberate design.

Both pages still PATCH the same `PATCH /sites/:id/theme-settings` endpoint with the FULL `ThemeSettings` object (`Site.updateThemeSettings` fully replaces, no partial-patch support) — each page round-trips the fields it doesn't own unchanged from the site record already in the shared React Query cache, the same pattern `GlobalStylesDialog` already used for the fields it doesn't own.

### Locale picklist: a curated hardcoded list of full BCP-47 tags (language+region), not a library, not base-language-only

`libs/shared-types/locale-codes.ts` adds `CURATED_LOCALE_CODES` (~60 curated `language-REGION` tags, e.g. `it-IT`, `en-US`, `en-GB`) — same "curated constant array" pattern already used for `CURATED_THEME_FONTS`, not a new npm dependency (`iso-639-1` or similar) for something that changes rarely. Display names are derived at render time via the native `Intl.DisplayNames` API (`getLocaleDisplayName(code, uiLocale)`), never hardcoded, so a name can never drift from what the runtime itself calls a language and adding a new code never requires writing its name by hand.

Scope is full tags with region, not base-language-only: the user's own expectation going in was picking `en-US` vs `en-GB` vs `it-IT` as distinct entries, not a two-step language-then-region picker. `localeSettingsSchema` itself is untouched — still accepts any 2+ character string, per its own existing comment — so a site with an already-stored non-curated code keeps working unchanged; it just won't appear pre-selected in this picker.

`LocaleListEditor`'s free-text `<Input>` + "Aggiungi" button is replaced by a `Popover` containing a plain `<input>` + client-side filter over `CURATED_LOCALE_CODES` (matching on both code and display name), rendered as a clickable list — no `cmdk`/Combobox dependency, following `IconPickerDialog`'s (docs/adr/0023) already-established "raw input + `useMemo` filter" pattern instead of introducing a new one. `IconPickerDialog` renders a grid (icons); this renders a vertical list (text), the one deliberate layout difference between the two.

## Consequences

- Two independent pieces of debt closed in one branch: no more per-vendor hardcoding for CSP, no more freeform locale codes going forward (existing non-standard ones are left alone, not migrated).
- `content-security-policy.ts`'s CSP header is now genuinely per-site: every route that renders a real page (`[locale]/index.astro`, `[locale]/[...slug].astro`, `[locale]/search.astro`, `preview/[pageId].astro`) now calls `buildContentSecurityPolicy` itself with that site's `allowedTrackerDomains`, instead of relying on `middleware.ts`'s one-size-fits-all default. A 404 (no site resolved yet) still gets the strict hardcoded-only default.
- `IntegrationsView`'s tracker-domain validation only checks hostname _shape_, not reachability or vendor legitimacy — same trust boundary as the pre-existing head/body script fields, disclosed in the UI's own copy, not a gap introduced here.
- The curated locale list (~60 entries) and tracker-domain UI are both hand-authored, not generated from an external spec — extending either later is a one-line array addition, not a migration.
- Not verified: real-browser click-through of the new `/integrations` page and locale picker (editor-app's headless Playwright login is independently known-flaky — not attempted here to avoid burning time on an unrelated issue). Verified instead: the full CSP pipeline end-to-end against a real Postgres-backed site and page (DB → domain entity → API → public-site route → response header), and the new UI components/interactions through unit tests (add/remove tracker domain, invalid-domain rejection, add/remove/search locale, save round-tripping fields each page doesn't own).
