# @kometio/editor-app

The authenticated admin/editor SPA: React 19, TanStack Router (file-based
routes) + TanStack Query, Vite. Every route requires a session — see
[ADR-0010](../../docs/adr/0010-session-based-auth-foundations.md).

## Where things live

`src/app/` is grouped by what a screen is for, not by what a file is:

| Folder                                                                      | What is in it                                                                                                                                             |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth/`                                                                     | login, invitation, password reset, first-run setup, e-mail verification, the session hooks                                                                |
| `account/`, `users/`                                                        | the signed-in person's profile; the team list and invitations                                                                                             |
| `pages/`                                                                    | the pages list, the page editor, translations, SEO, terms, templates, the page pickers                                                                    |
| `canvas/`                                                                   | the visual editor (see below)                                                                                                                             |
| `sections/`, `layout/`                                                      | reusable sections; the site's header and footer                                                                                                           |
| `media/`, `forms/`, `collections/`, `taxonomies/`, `imports/`, `dashboard/` | one screen and its queries each                                                                                                                           |
| `settings/`, `legal/`                                                       | site settings dialogs, integrations, the cookie banner; the legal documents wizard                                                                        |
| `style/`                                                                    | the site's look: global styles, theme queries, theme upload, the icon picker                                                                              |
| `shell/`                                                                    | the frame around every screen: `admin-shell`, page header, route errors, toasts                                                                           |
| `common/`                                                                   | what several screens share and no screen owns: confirm and prompt dialogs, icon button, save status, version history, the draft and unsaved-changes hooks |

A folder may import from another (a page needs the media picker); the
grouping is for finding things, not for isolation. A file used by three or
more folders and owned by none goes to `common/`. The rules a change is
checked against are in [DESIGN.md](./DESIGN.md).

## The canvas editor

There is no third-party page-builder library (Puck was fully removed). The
canvas (`src/app/canvas/`) doesn't render blocks itself in React — it embeds
the **real** page, rendered by `apps/public-site` in its dedicated preview
route (`/preview/:pageId?token=...`), inside an `<iframe>`
(`canvas-frame.tsx`) and drives it entirely through a typed `postMessage`
protocol shared with public-site
(`libs/shared-types/src/lib/preview-bridge-protocol.ts`).

- The iframe URL is built from `VITE_PUBLIC_SITE_URL` plus a short-lived,
  page-scoped preview token minted via `POST /pages/:id/preview-token`
  (`src/lib/preview-token-api-client.ts`) — stateless, HMAC-signed, see
  [ADR-0024](../../docs/adr/0024-stateless-signed-preview-tokens.md).
- `use-preview-bridge.ts` is the parent side of the protocol: it receives
  `preview:*` messages (hover, click, drag, block rects, ...) from the
  injected client script running inside the iframe
  (`apps/public-site/src/lib/preview-bridge-client.ts`) and replies with
  `editor:*` commands. Hover/selection overlays, drag-reorder, and
  insert/remove all round-trip this way — the parent never touches the
  iframe's DOM directly.
- **Inline text editing**: a double-click inside the iframe mounts a TipTap
  editor directly on the DOM node being edited (inside the iframe's own
  document, not the parent) and streams `preview:text-changed` messages back
  for the same debounced draft save every other field edit uses. See
  [ADR-0028](../../docs/adr/0028-canvas-inline-text-editing-via-tiptap-in-preview-iframe.md)
  for why (this replaced Puck's own `InlineTextField`, which had an upstream
  cursor bug under rapid typing).
- The canvas reads/writes Kometio's own `Block[]` content model directly — no
  data-format mapping layer, see
  [ADR-0007](../../docs/adr/0007-nested-block-content-model-independent-of-puck.md).
  `libs/block-registry` (`@kometio/block-registry`) supplies the field
  descriptors (`FieldDescriptor`, incl. `inlineEditable`), defaults, and
  container-nesting rules per block type, consumed by `inspector-panel.tsx`/
  `block-picker.tsx`/`layers-panel.tsx`.

## Routing

File-based routes under `src/routes/` (TanStack Router, `routeTree.gen.ts`
generated by `@tanstack/router-plugin`'s Vite plugin — don't hand-edit it).
Notable ones:

- `__root.tsx` — router context (`QueryClient`), pending/error components.
- `_shell.tsx` — the authenticated admin-shell layout (`AdminShell`), parent
  of every `_shell.*` route (`_shell.pages.index.tsx`,
  `_shell.forms.index.tsx`, `_shell.forms.$formId.tsx`,
  `_shell.media.index.tsx`, `_shell.layout.index.tsx`,
  `_shell.style.index.tsx`, `_shell.users.index.tsx`).
- `pages.$pageId.tsx` — the fullscreen canvas editor, deliberately **outside**
  `_shell` (no admin chrome around the canvas).
- `login.tsx`, `accept-invite.tsx`, `reset-password.tsx`, `verify-email.tsx`
  — unauthenticated auth-flow routes.

Every guarded route's loader wraps its data fetch in `requireAuth()`
(`src/routes/-require-auth.ts`): there's no separate "am I logged in"
endpoint, so a `401` from the loader's own query is the signal, caught and
turned into a `redirect({ to: '/login' })`.

## i18n

`react-i18next` + `i18next`, initialized in `src/i18n.ts`. Dictionaries:
`src/locales/it.json` (source of truth — TypeScript's `CustomTypeOptions`
module augmentation is keyed off `it`, not `en`, so a typo/omission in the
English file is what gets caught at compile time) and `src/locales/en.json`.
No browser-language auto-detection — starting language is fixed
(`lng: 'it'`), changed only via the in-app language switcher. This is
editor-chrome UI copy, unrelated to `apps/public-site`'s page-content
translation system ([ADR-0017](../../docs/adr/0017-multilingua-locale-prefixed-urls-and-page-translations.md))
or its separate `Translator` class for block UI-chrome strings.

## Running

```sh
pnpm exec nx run @kometio/api:serve        # http://localhost:3000/api (required)
pnpm exec nx run @kometio/public-site:dev   # http://localhost:4321 (required for the canvas iframe)
pnpm exec nx run @kometio/editor-app:dev     # http://localhost:4200
```

Requires the API's Postgres migrated/seeded first (see
`docs/development.md`) — login uses the `db:seed` dev user. `VITE_`-prefixed
env vars (`VITE_API_URL`, `VITE_PUBLIC_SITE_URL`, `VITE_TURNSTILE_SITE_KEY`)
are read by Vite — see `.env.example` at the repo root.

All three are the DEV and fallback half of a pair (ADR-0076): in a
container the same values arrive at start-up through
`KOMETIO_API_URL`/`KOMETIO_PUBLIC_SITE_URL`/`KOMETIO_TURNSTILE_SITE_KEY`,
which the entrypoint writes into `/config.js` (nginx also uses the two
addresses to build the Content-Security-Policy header).
The build-time value is what the bundle falls back to when that file set
nothing, so one published image serves any domain and any captcha key.

There is deliberately no `VITE_DEFAULT_SITE_ID` among them: which site this
editor edits is resolved at runtime from the API, because a value baked into
the bundle at build time can never name a site the first-run wizard creates
afterwards. See
[ADR-0044](../../docs/adr/0044-runtime-site-resolution-in-the-editor.md).

## Nx targets

```sh
pnpm exec nx run @kometio/editor-app:dev         # dev server (Vite)
pnpm exec nx run @kometio/editor-app:build       # production build
pnpm exec nx run @kometio/editor-app:test        # vitest
pnpm exec nx run @kometio/editor-app:lint        # eslint
pnpm exec nx run @kometio/editor-app:typecheck   # tsc --noEmit
```

## Forms

Settings dialogs that stay mounted for the app's lifetime (business info,
general/SEO/locale settings, global styles) use `react-hook-form` with a
shared `useResetFormOnOpen` hook to re-seed form state from freshly-fetched
data — see
[ADR-0027](../../docs/adr/0027-react-hook-form-for-settings-dialogs.md).
Other forms (`login-form.tsx`, `forgot-password-form.tsx`, ...) still use
plain `useState` per field — not a "two philosophies" inconsistency to fix,
just no duplication problem there to solve (see the ADR's own conclusion).
