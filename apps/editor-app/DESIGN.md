# Design system: Kometio editor

The editor is a working tool, not a marketing page. Someone spends hours in
it, so it is quiet, dense where it has to be, and consistent: one accent,
one type family, one set of primitives. Every value below is the one the
code uses today (`src/styles.css`, `src/components/ui/`); when the code and
this file disagree, fix one of them in the same change.

Read this before changing anything the editor shows. It is not the design
of the sites Kometio builds — those belong to their themes.

## 1. Atmosphere

- **A tool that recedes.** Neutral surfaces, text that reads, and colour
  only where it means something: the accent for "this is the action" and
  "this is selected", two state colours, and destructive red.
- **Density: balanced to dense.** Panels, lists and inspectors are compact
  (`text-sm`, 32 px controls); dialogs and empty views breathe more. Never
  a marketing layout inside the tool.
- **Motion: almost none.** Short state transitions (100–200 ms), no
  entrance choreography, no looping animation. The canvas is where the
  user's own site moves; the chrome around it stays still.
- **Light and dark are equals.** The editor follows the system until the
  user picks one (`src/theme.ts`). Every change is checked in both.

## 2. Colour and roles

Tokens live in `src/styles.css` as `oklch`, exposed to Tailwind as
`bg-primary`, `text-muted-foreground`, and so on. Use the token, never a
palette colour (`bg-blue-600`, `text-amber-600`) in a component.

| Token                                    | Light                             | Dark                         | Role                                                             |
| ---------------------------------------- | --------------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| `background`                             | `oklch(1 0 0)`                    | `oklch(0.145 0 0)`           | The page                                                         |
| `card`, `popover`                        | `oklch(1 0 0)`                    | `oklch(0.22 0 0)`            | Surfaces that sit on the page                                    |
| `sidebar`                                | `oklch(0.985 0 0)`                | `oklch(0.185 0 0)`           | The navigation, quieter than content                             |
| `canvas-stage`                           | `oklch(0.95 0 0)`                 | `oklch(0.17 0 0)`            | Behind the page in the canvas, so the page has an edge           |
| `foreground`                             | `oklch(0.145 0 0)`                | `oklch(0.985 0 0)`           | Text                                                             |
| `muted-foreground`                       | `oklch(0.52 0 0)`                 | `oklch(0.708 0 0)`           | Secondary text, hints, metadata                                  |
| `muted`, `secondary`, `accent`           | `oklch(0.955–0.97 0 0)`           | `oklch(0.269 0 0)`           | Hover fills, quiet buttons, selected rows                        |
| `primary`                                | `oklch(0.546 0.245 262.9)`        | `oklch(0.809 0.105 251.813)` | **The one accent**: primary action, selection, focus ring, links |
| `primary-hover`                          | primary + 14 % foreground         | primary + 10 % background    | The primary button under the pointer                             |
| `warning`                                | `oklch(0.52 0.14 62)`             | `oklch(0.82 0.16 75)`        | A state: unpublished changes, a thing to look at                 |
| `success`                                | `oklch(0.508 0.118 165.6)`        | `oklch(0.845 0.143 164.978)` | A state: published, done                                         |
| `destructive`                            | `oklch(0.49 0.19 27.325)`         | `oklch(0.78 0.15 22.216)`    | Deleting, and errors                                             |
| `success-surface`, `destructive-surface` | the state at 10 % on `background` | same                         | A state's tint, opaque: what a toast sits on                     |
| `border`                                 | `oklch(0.88 0 0)`                 | white 15 %                   | Dividers, card edges                                             |
| `input`                                  | `oklch(0.85 0 0)`                 | white 23 %                   | Field edges                                                      |
| `ring`                                   | `= primary`                       | `= primary`                  | Focus                                                            |

Rules:

- **One accent, one hue.** Primary is the same blue ramp in both themes
  (600 light, 300 dark). A state is never shown with the brand colour:
  "Published" is `success`, not `primary`.
- **Neutrals are true greys** (chroma 0). Do not tint one surface warm
  and another cool.
- **Contrast, as measured** (recorded in `styles.css`): white on primary
  5.26:1, hovered 6.62:1 light and 8.73:1 dark (`primary-hover`: a
  hover darkens or lightens away from the text, never an alpha that lets
  the page through; a mix is `color-mix(in oklab, …)`, since in oklch
  a grey's hue of 0 is mixed in and a green tint comes out pink); muted text 5.49:1 on the page and 4.82:1 on a
  `muted` row fill (5.86:1 in dark), so a hovered or chosen row keeps its
  secondary text readable; warning as text 5.72:1 light, 11.07:1 dark; the destructive
  button in a dialog's footer 5.43:1 light and 5.54:1 dark, hovered 4.56:1
  and 4.93:1. Measure a tinted button on the painted pixels, in both
  themes, at rest and hovered, and inside a dialog too: axe only sees the
  surface and the state the page happens to be in. Any new text colour
  needs 4.5:1 on its surface, and a new state colour must work both as a
  sentence and as a fill.
- **Borders are below 3:1 on purpose** (1.44–1.98:1): the field fill
  (`bg-input/30`) carries the edge. Do not "fix" it with darker rules, and
  do not remove the fill.
- The only palette colours allowed in a component are the avatar colours
  in `user-avatar.tsx`, which identify people, not states.

## 3. Typography

- **One family: Geist Variable** (`@fontsource-variable/geist`), for
  headings and text. `font-mono` only for code, keys and identifiers.
- **Scale, as used:** `text-sm` (14 px) is the body of the tool (236
  uses); `text-xs` (12 px) for hints, metadata, badges and group labels
  (151); `text-xl` for view titles (21); `text-2xl` for the few page-level
  titles (7). `text-base` and `text-lg` are rare. Do not add arbitrary
  sizes (`text-[13px]`) outside the primitives: the `sm` button's own
  0.8 rem is the one that belongs to the system.
- **Weights:** 400 for text, `font-medium` (500) for labels, buttons and
  navigation, `font-semibold` (600) for titles and group headings. Bold
  (700) only on the logo mark.
- **Numbers that line up** (sizes, counts, dates in lists) use
  `tabular-nums`.
- **Case:** sentence case everywhere, in both languages. Uppercase for two
  things only: small group labels (sidebar, block picker, inspector
  sections, fieldset legends: `text-xs font-semibold uppercase
tracking-wide text-muted-foreground`) and language codes (`EN`, `IT`).

## 4. Components

Use the primitives in `src/components/ui/` (shadcn on `radix-ui`); do not
style a raw `<button>`, `<select>` or `<dialog>` by hand. A screen
(`src/app/`) has no `<button>` at all (lint: `react/forbid-elements`):
every one is one of the primitives below. Every screen opens with a
`PageHeader`, the canvas's bar and page are named landmarks, and axe
stays at zero on each screen in both themes (the `region` best practice
on a portalled menu excepted).

- **Button** (`button.tsx`). Height 32 px (`default`), 28 px (`sm`),
  24 px (`xs`); radius `rounded-lg`; `text-sm font-medium` (0.8 rem at
  `sm`); icons 16 px.
  Pressed moves 1 px down; focus is a 3 px ring in the accent at 50 %.
  - `default` (accent fill): **one per view or dialog**, the action the
    user came for.
  - `outline`: the everyday button (most used); `ghost`: toolbar and
    row actions; `secondary`: a quiet alternative; `link`: inline.
  - `destructive` is a tinted red, not a solid one, so deleting never
    looks like the primary action.
  - An icon-only button is an `IconButton` (`app/common/icon-button.tsx`):
    its `label` is both the accessible name and the tooltip, and a
    `shortcut` shows in the tooltip only, never in the name. It is
    `type="button"` unless it says `type="submit"`: inside a form, an
    icon that removes a row must not save the form. A toggle
    (Bold) passes `aria-pressed`, and `ghost` draws it pressed. An icon
    at `icon-xs` is 12 px unless it carries a `size-` class of its own.
  - `variant="inline" size="inline"`: a button inside a line of text,
    like the canvas breadcrumb — the line's own size and colour, no box,
    underlined under the pointer, truncating with the line.
  - **Nothing in the canvas is hidden.** Icon-only is for the handful
    whose icon is universal (undo, redo, the breakpoints, the arrows,
    close); everything else writes its name, in the rail, the block
    toolbar and the insert points. The toolbar appears on a _selected_
    block, never on hover. Every keyboard shortcut is the accelerator of a
    button that is on screen: mod+K is the search box in the bar, "/" is
    Add, "?" is Shortcuts. A group that folds (`<details>` in the
    Properties panel) shows a chevron.
- **ListItemButton** (`list-item-button.tsx`): a row of a list or a menu
  that does something when chosen. `inset="menu"` inside a popover or a
  menu, `inset="row"` in a bordered `divide-y` list, `inset="none"` when
  the container draws the frame and the state (the page tree, the
  layers). Its fill follows its ARIA state — `aria-current="true"` for
  where you are, `aria-pressed` for what is chosen — so the two cannot
  disagree; `tone="destructive"` for Delete in a menu.
- **TileButton** (`tile-button.tsx`): a picture with its name under it,
  in a grid, that acts when chosen (a block to insert, an icon to use).
  **RailButton / RailLink / RailAnchor** (`app/common/rail-item.tsx`) are
  its shape in a 72 px strip — the canvas's and the folded sidebar's —
  with no side padding, so a word up to 68 px fits: a picture, the word,
  and the accent tint on the picture (never on the text) for what is
  open or current.
- **Checkbox** (`checkbox.tsx`): a box that is ticked or not, for a thing
  chosen among others — a document to generate, a language to keep, a
  term to file a page under, an "I understand". Radix underneath (a real
  control with `aria-checked`), named by the `<label>` around it or a
  visible `Label`. The test against `Switch` is the sentence: "include
  this" is a box, "the banner is on" is a switch. Never a native
  `<input type="checkbox">`.
- **ChoiceGroup** (`choice-group.tsx`): one choice among a few, all in
  view — `segmented` for a strip (the theme, a kind of file), `tiles` for
  a grid of pictures (a collection's icon, a theme colour). Radix
  RadioGroup: the group is one tab stop and the arrows move the choice.
  A choice with an `icon` is named by its `label`, shown as its tooltip.
- **Tabs** (`tabs.tsx`): a strip that switches the panel under it,
  `segmented` in a panel or a dialog, `underline` for the sections of a
  page. Roving tab stop, arrows, Home and End; the panel is a `TabPanel`
  with the same `id`, so each points at the other.
- **Dialog** (`dialog.tsx`, `alert-dialog.tsx`). The default width is
  `sm:max-w-sm`, right for a question; forms widen to `sm:max-w-lg`,
  pickers to `sm:max-w-2xl`. Title always
  present (visually or `sr-only`); the close button's name is translated
  (`common.close`). Ask a
  question with `ConfirmActionDialog`, **never `window.confirm`**; ask
  for one typed answer (a name, an address) with `PromptDialog`, **never
  `window.prompt`**: a refusal is said under the answer, which stays. A
  form inside one is `flex flex-col gap-4`, so its last line never sits
  on the footer's edge. The site's own settings are not dialogs: they are
  the sections of the Settings area (below), each saved by a `SaveBar`.
- **Fields.** `Label` above the control — visible, so the name is still
  there once something is typed — hint in `text-xs
text-muted-foreground` below, error in `text-destructive` below and tied
  with `aria-describedby`. When the API refuses a field it says which:
  `applyApiFieldErrors` (`lib/http-client.ts`) puts its sentence under
  that field, and only what names none is said at the foot of the form. Every control has a name: `inspector-
accessibility.spec.tsx` checks it for every block type.
- **SaveBar** (`app/settings/save-bar.tsx`): the one way a screen that
  saves as a whole saves. Nothing sits at the foot of the form until
  something has changed; then a `sticky bottom-4` bar says "Unsaved
  changes" (a dot **and** the words) with Cancel (`ghost`, puts the
  saved values back) and Save (`default`, the only filled button of the
  view). A refused save is said above it, in place, with
  `role="alert"`, and says WHAT was not saved ("The languages were not
  saved. Try again."; `useSavedForm` takes the sentence as `failedMessage`,
  so a section cannot leave it out) rather than a generic "something went
  wrong"; a save that worked is a toast — and so is every save that has no
  bar (a dialog, a switch, a picture). The bar also answers for
  leaving: the browser is asked before a reload, and the app's own dialog
  before a link, so nothing is lost by accident. It is a form's submit
  button, so Enter and the button end in the same place.
  A form built on `useSiteSettingsForm` (or on `useSavedForm`, which it is a
  thin layer over, for a record that is not the site's — a term of a
  category) takes what the server kept (a
  value trimmed, a vendor recognised) as its saved state, and a value set
  from code (`setValue`) passes `{ shouldDirty: true }` or the bar never
  shows. A screen that keeps its own state (the AI settings) uses `SaveBar`
  directly, with its own `isDirty`. The form itself is `SettingsForm` (fields, error, bar), and
  `SettingsSection` is that under an `h2` and a sentence for a section of
  the Settings area; a screen with a title of its own, like Style, uses
  `SettingsForm` under its `PageHeader`. The form is `noValidate`, so a
  field's own rule answers under the field instead of the browser's
  bubble. A save that turns something off or takes something away asks
  first, at Save and not at the switch (`confirmBeforeSave` on the form's
  hook, drawn by `SettingsForm`): the site's domain changing, indexing
  going off, a language leaving, submissions being deleted sooner. The
  question says what will stop working, in words, and only for that
  direction — turning indexing on asks nothing. The button says the verb
  ("Change domain"), and is red only for what cannot be undone. The
  area's content is one column that may not outgrow the
  screen (`minmax(0,1fr)`, `min-w-0`): a grid's automatic column is as
  wide as its longest unbreakable line, and one long email made every
  section wider than a phone. A long name or address in a row is a
  `min-w-0` block with a `truncate` inside it.
- **Badge** (`badge.tsx`): states have their own variants (`warning`,
  `success`); do not colour a badge at the call site. A page's state is
  drawn by `pageStatusBadge` (`app/pages/page-status.ts`) wherever it
  shows — draft is `secondary`, published `success`, published with
  changes not yet online `warning` — so the same page cannot read
  differently in two lists. A person's access is drawn the same way in the
  users' list: can sign in `success`, invitation waiting `warning`,
  cannot `outline`. "You" beside your own name is `secondary`: it says
  who, not how things are.
- **Roles** (`RoleDescriptions`, `app/users`): what each role may do, one
  line per role, in the words of what a person does. Under the users' list
  and in the invitation, where the choice is made; the role being chosen
  is set apart by weight and colour, never by dimming the others (a
  dimmed muted line fails contrast).
- **A fact about the server** (`EmailNotConfiguredNotice`, `app/common`):
  "this installation cannot send email", said where the person is about to
  depend on it — the users' list, the invitation, and the forgot-password
  screen, which is read before sign-in — from `GET /api/deployment`, open to
  anyone. A neutral bordered card with a `warning` icon, which is
  decoration (the words carry the meaning), and no way to dismiss it: it is
  true until the server changes. It draws nothing while the answer is
  unknown or could not be fetched; a notice that might be wrong is worse
  than none. A confirmation that would say "sent" says what really happened
  instead (`useServerSendsEmail`, and `emailSent` in an invitation's answer):
  no mail server, or a mail server that refused it.
- **Something the server may not be able to do** (`useServerFeatures`,
  `app/common/deployment-queries.ts`): the editor offers it only where `GET
/api/deployment` says the server can — Settings → Export, today (`siteArchive`).
  The opposite default to the notice above, for the opposite reason: a notice
  that might be wrong is worse than none, and a menu entry that might lead nowhere
  is worse than one that is missing, so while the answer is unknown, or could
  not be fetched, the server is read as unable. A settings section says what it
  needs with `requires` in `SETTINGS_SECTIONS`, and the menu and the search read
  it through the one hook (`useVisibleSettingsSections`), so they cannot
  disagree; its route sends an address typed by hand back to the settings.
- **A download is a link, not a request** (`app/settings/site-archive-section.tsx`,
  and the forms' CSV): a `Button asChild` around an `<a href download>` to the API,
  so that a large file goes to disk as it arrives and the session cookie goes with
  it. In a new tab (`target="_blank" rel="noopener noreferrer"`): across two origins
  `download` is ignored, and a refusal would otherwise take the editor's place.
  What the file holds, and that it is a secret when it is one, is said beside the
  button, before the click.
- **A dialog taller than the screen scrolls**: `max-h-[calc(100dvh-2rem)]`
  and `overflow-y-auto` on its `DialogContent`, as the invitation's has. The
  `Dialog` primitive is centred and does not limit itself, so a long form
  loses its buttons below the edge of a phone.
- **ContextMenu** (`context-menu.tsx`): what a right-click, the menu key
  or a long press opens on a thing — the layers' Duplicate / Move / Delete.
  Radix, not modal: it stays on screen at the edges, the arrows and a
  letter move through `ContextMenuItem`s (`variant="destructive"` for
  Delete), Escape puts the focus back on the row. A right-click on a row
  selects its block first, so the menu acts on it.
- **Popover** (`popover.tsx`): a `PopoverContent` is a dialog to a screen
  reader and takes an `aria-label` (the type requires one), and it never
  grows past the room on screen — taller content scrolls inside it.
- **Select, Popover, Tooltip, Switch, Accordion, DatePicker,
  RadioGroup**: Radix underneath; keep keyboard behaviour as Radix gives
  it. A choice between options that need a sentence each ("add to the
  page" or "replace it") is a `RadioGroup`, one `Label` per item; a short
  one is a `ChoiceGroup`.
- **Command menu** (`app/common/command-menu.tsx`): the search of the
  canvas (blocks to add, layers, the page's actions, the editor's own)
  and of the shell (where to go, what to do, what to change, and the
  site's pages, files and forms). One component, given its groups in
  order and its own words; a source that is on a server passes
  `onQueryChange` and `loading`. Every entry also exists elsewhere on
  screen; it is the quick way to them, never the only one. It opens from
  a `SearchTrigger` — a button that looks like a field, showing the key —
  and from mod+K.
- **Toasts** (`toast-provider.tsx`) for results of an action the user
  already left behind; inline messages for anything tied to a field. A
  toast may carry one action (`{ label, onClick }`) for the next step the
  result makes obvious — "Open the copy" after a duplicate.
- **Selection bar** (`app/common/selection-bar.tsx`, filled by
  `PagesSelectionBar` and the forms list): a list whose rows can be acted
  on together has a checkbox on every row and, once one is ticked, a bar
  above the list that says how many and lists the actions, written out —
  icon and word, never a picture on each row that only shows on selection.
  The name of the row is a link to it; the row carries the selected state
  (`bg-muted` and a `primary` strip at the left), not the box. An action
  that has no meaning for many rows (Open, Move under…) is offered for
  exactly one. Bulk actions run one after another and answer with one
  toast; a delete asks first, naming what goes — and what goes with it,
  when it is something that cannot be made again (a form's submissions).
  A list that is reordered by dragging says so when it cannot be (filters
  on, more than one page) instead of just not offering it.
- **Pagination** (`app/common/pagination.tsx`): the one "Previous / Page 2
  of 5 / Next", drawn for every list that is cut into pages and for none
  that fits on one. The caller decides what changing page does — a list in
  the address writes it there, a picker keeps it in state.
- **Side panel** (`app/media/media-detail-sheet.tsx`): the details of one
  thing in a list — a file — open in a `Dialog` anchored to the right edge,
  `w-96` (most of the screen on a phone): focus goes to the panel itself,
  Escape closes it, the page behind is inert. The thing is in the address
  (`?file=<id>`), so the panel has a link and Back closes it; a panel opened
  from the list closes by stepping back, one opened by a link by replacing
  the address. Every action in it is written (Copy URL, Download, Delete),
  and what is deleted is asked about first.
- **Uploading** (`app/media/media-upload.tsx`, `use-media-uploads.ts`): any
  number of files, one after another, a line for each saying where it is
  ("Waiting", "Uploading…", "Uploaded", "Not uploaded: _why_") and staying
  until hidden; a toast at the end says how many and where, with "See" when
  that is somewhere else. The area that takes a drop is drawn only while a
  file is over it (`border-dashed border-primary`, "Drop to upload") — no
  box on the page for someone who is not dragging — and the button is the
  way in for a keyboard and a phone. The warning that nothing uploaded is
  checked is said at that moment, not on the page.
- **A record with a lot to it has a page of its own** (a term of a category:
  `app/taxonomies/term-editor-view.tsx`), not a row that unfolds in its
  list: it has an address to be sent, a breadcrumb up the trail ("Categories
  › Topic › Espresso", a `nav` with `aria-current` on the last), its name as
  the `PageHeader` title with what it belongs to under it, one form saved by
  the `SaveBar`, and its Delete apart from that form, below it, with what
  happens to what is inside. The list keeps only what is needed to find one:
  the name, the address, how many are inside.
- **What is on screen is in the address** (`validateSearch`, zod with
  `.catch`): a filtered list survives a reload and the back button and can
  be sent as a link; so do the section of a screen that has two (`?tab=`
  on a form: its fields, its answers — replaced, not pushed, since a tab
  is not a place to come back to) and the page of a paged list inside it.
  The unsaved-changes question is asked when a screen is LEFT (another
  path), not when its own address changes. Typing is the exception — the text is written once it pauses —
  and any change goes back to page 1.
- **InlineError** (`inline-error.tsx`): every error shown in place —
  under a field (pass `id`, and point the control's `aria-describedby`
  at it) or under the form or list whose action failed. `text-sm
text-destructive`, announced with `role="alert"`, nothing drawn when
  empty. Its words come from `actionErrorMessage(error, fallback)`
  (`lib/http-client.ts`): the server's own sentence, or the fallback —
  never `String(error)`, which printed `ApiError: API 500: {…}`. A
  conflict is `error instanceof ApiError && error.status === 409`, not a
  search for "409" in the text.
- **Loading** (`skeleton.tsx`): a view or dialog waiting for its data shows
  the shape it is about to have, `SkeletonFields` for a form and
  `SkeletonRows` for a list, never the bare word "Loading…". Both are a
  `role="status"` that names what is loading for a screen reader, and they
  pulse only under `motion-safe`. Plain text stays right for an action in
  progress ("Generating preview…") and for the route change before the
  shell exists.
- **Screen header** (`app/shell/page-header.tsx`): every screen in the
  shell opens with `PageHeader` — title, an optional one-sentence
  description, and the screen's actions at the right of the title. Never
  a hand-written `<h1>` and never padding of the screen's own: the shell
  already pads. A section of the Settings area is under the area's own
  `h1`, so it opens with `SettingsSectionHeader` (an `h2`).
- **Dates** come from `useFormatDate()` (`lib/use-format-date.ts`): the
  month by name, in the editor's language ("Sep 12, 2026" / "12 set
  2026"); `useFormatDate('dateTime')` adds the time (a version, a
  submission), `useFormatDate('time')` is the time alone ("saved at").
  Never `toLocale*String()` or `Intl.DateTimeFormat` in a component,
  whose 9/12/2026 is a different day on each side of the Atlantic (lint:
  `no-restricted-properties`).
- **Fields** are `Input`, `Textarea` and `Select`, never a native control
  with the primitive's classes copied onto it: a copy misses the states
  (dark fill, placeholder colour, disabled, invalid). A field's name is a
  visible `Label` above it, not its placeholder.
- **A record among many that saves on its own** (a collection in the
  settings): the row is a small form. Its Save and Cancel appear only
  while it differs from what the server has, saving is a button and never
  the field being left, and a refusal is said under the row with what was
  typed kept. A choice that is only a choice (the template new pages start
  from) takes effect when made and says so with a toast.
- **RadioOption** (`app/common/radio-option.tsx`): one option of a
  `RadioGroup` with its own sentence — a label, what it does, and a frame
  around the chosen one — for a choice between things that each need
  explaining ("send to another language" or "show not available"). A
  switch holds one of the two and leaves the other in a paragraph.
- **Links inside text** (an address to open, the author page) are
  underlined at rest — a link in the foreground colour with an underline
  only on hover reads as plain text — and one that opens another tab says
  so to a screen reader (`sr-only`), with `rel="noopener noreferrer"`.
  `OptionsSelect` shows its `placeholder` while the value is empty and
  there is no "None" choice, and takes `aria-invalid`. A choice of country
  is `listCountries(language)` (`@kometio/shared-types`): the names are the
  platform's, sorted the way the language sorts.
- **Steps** (the legal documents wizard, `app/legal`): Next judges the
  step. Every field that is wrong says so under itself (`WizardField` /
  `WizardChoices`: `InlineError` tied by `aria-describedby`, `aria-invalid`
  on the control), and the focus goes to the first of them. Nothing is
  judged before Next is pressed — "not an email" under "a@" while it is
  being typed is nagging — and once it has complained, a fix takes its
  sentence away at the keystroke that makes it right. Enter in a field is
  "Next": the one submit is on the last step.
- **Putting things in order** (the terms of a category, `term-tree-editor`):
  a **Reorder** toggle (`aria-pressed`, "Done" while on) shows written **Up**
  and **Down** beside each term, each named with the term for a screen
  reader, among its own siblings only, and each acting at once — the whole
  sibling group goes to the API in one call. The buttons a term cannot use
  (the first one's Up, the last one's Down) are disabled; nothing is drawn
  at all while every term is alone under its parent. No dragging: the
  buttons work by keyboard, by touch and on a phone without a gesture to
  learn. The pages list, which has drag, keeps it.
- **AuthPage** (`app/auth/auth-page.tsx`): every screen a person reaches
  before they are in the editor — sign in, forgot and reset the password,
  accept an invitation, confirm an address, the first-run setup — is a card
  in the middle of a `<main>`, with its title as the page's `h1`
  (`CardTitle as="h1"`). Built from it, never from a `div` and a `Card` by
  hand: seven copies of that had no main landmark and no level-one heading.
  `width="md"` only for the setup's long form.
- **Changing how you sign in** (`app/account`, the Accesso section of the
  profile): the email and the password each have a button that opens a
  dialog of its own and acts at once, without waiting for the profile's
  Save. Both ask for the current password again, in `PasswordField`
  (`app/account/password-field.tsx`: label above, hint and `InlineError`
  below, tied by `aria-describedby`), and a wrong one is said under that
  field with what was typed kept. The submit is never disabled to say
  something is missing — it is pressed and the sentence appears under the
  field. A dialog opens empty every time. The email dialog turns into its
  own confirmation ("Check your inbox", with both addresses) instead of a
  toast, because what it says has to be there when it is looked for. The
  dialogs are siblings of the profile's `<form>`, never inside it: React
  sends a submit up through a portal to the form that rendered it.
- **Preview drawn by the editor** (`CookieBannerPreview`): where a setting
  is about how something looks, the form shows the thing beside its
  controls, from the values in the form, saved or not. It is `role="img"`
  with a label — nothing on it can be pressed or tabbed to — and a line
  under it says it is approximate and that the site applies its own style.

## 5. Layout

- **The admin shell:** a 208 px sidebar (`w-52`, `bg-sidebar`) on the
  left from `md` up; below it, a 48 px top bar with the mark, the name of
  the screen, a written Search button and the menu. Content scrolls on its
  own; the shell is `h-dvh`. The sidebar holds only the daily work, top
  to bottom: the mark; the **site block** (its name, its domain or "Domain
  to be set", and a link to open it); the **search field** (a
  `SearchTrigger`, mod+K); the dashboard; **Content** (pages and the
  site's collections, media, forms, categories) and **Appearance** (header
  and footer, sections, style); then, at the foot, **Settings** and the
  account menu. One list of screens (`shell/nav-entries.ts`) feeds the
  sidebar and the search, and `use-sidebar-model.ts` filters it by role.
  - Folded (`kometio-sidebar-collapsed`, from `md` up, a click with no
    animation) it is the same 72 px strip as the canvas's: a picture with
    its word under it, never a picture alone. The group headings go and a
    rule separates the groups; what does not fit 68 px is shortened
    ("Header", "Opzioni") with the whole name as its accessible name, or
    gathered (more than three collections become one item that opens a
    list of names). The site is a link named for the site, the search a
    written item, the account the picture with the role under it.
- **The Settings area** (`/settings/*`, `settings/settings-layout.tsx`):
  the site's own settings — what was a popover of dialogs — as one area
  with its own menu (`settings-nav.tsx`, grouped Site, Connections,
  Privacy and access, and filtered by role; a `Select` on a phone) and a
  page per section, each with an address, in one width (`max-w-2xl`) and
  saved by a `SaveBar`. The sections and who is offered them are one list
  (`settings-sections.ts`); a section added there is in the menu, the
  search and the page the area opens on. The old addresses redirect.
  Preferences of the _person_ — the language and theme of the editor —
  are not here: they are in the account menu.
- **The canvas editor** (`canvas/canvas-editor-shell.tsx`), from left to
  right:
  - a 72 px **rail** (`canvas-rail.tsx`): Add and Layers at the top, which
    pick what the left panel shows, then Styles and Shortcuts at the
    bottom. Shortcuts opens its dialog; Styles opens the Style page in
    another tab (`target="_blank"`, a small arrow on its icon says it
    leaves), so the work on the canvas is not interrupted — the site's look
    has one home, `/style`, and no second copy in the editor. Every item is
    an icon **and** its name;
  - the **left panel**: one view at a time, Add (the block palette and the
    site's templates) or Layers, opening on Layers. Closed, it takes no
    room; the open view's rail button or the panel's own close button
    closes it;
  - the **canvas**: the page on `canvas-stage`, with a 24 px margin even
    at full width, so the page has an edge;
  - the **Properties panel**, the only thing on the right. With nothing
    selected it offers "Add a block" and the page's own actions.

  Both panels default to 256 px, resize between 200 and 560 px
  (`side-panel-preferences.ts`), and are remembered, as is the left
  panel's view (`use-left-panel.ts`). Below `md` the rail and the panels
  become a bar at the bottom (Add, Layers, Properties) that opens each one
  as a sheet over the lower part of the canvas (`mobile-panel-sheet.tsx`).

- **The canvas top bar:** the page's name, its language and Page menu, a
  Draft/Live badge and the save status on the left; the search box in the
  middle (the same `SearchTrigger` as the shell's sidebar); undo, redo,
  breakpoints, Preview and Publish on the right.
- **The dashboard** opens with what the site is and whether it is online,
  then a **launch checklist** (name, domain, a published page, the cookie
  banner, open to search engines: each a fact about the site, each one
  still to do with the button that does it, the whole list gone when the
  last is done, and offered only to who can act on it), three numbers that
  are links into their lists, all the same height, and one feed of recent
  activity — pages and form submissions, newest first, eight at most.
- **Spacing** follows Tailwind's 4 px scale: `gap-1.5`/`gap-2` inside a
  control, `gap-4` between groups, `p-3`/`p-4` inside panels.
- **Radius** comes from one variable, `--radius` (10 px): `rounded-md` for
  small things, `rounded-lg` for controls and cards, larger only for big
  containers.
- **Layers** (z-index): `z-10` for things over their own content, `z-50`
  for overlays (Radix portals), `z-200` for toasts. Nothing else.

## 6. Depth

Depth comes from surfaces, not shadows: page, card and sidebar are three
different lightnesses, especially in dark mode, where a shadow does not
show. Shadows stay the primitives' own (popover, dialog). Do not add glow,
coloured shadows or gradients to the chrome.

## 7. Do and don't

Do:

- Show every state of a view: loading, empty (what it is and the one
  action that fills it), error (what happened, in words, and what to do),
  and the normal one.
- Say what is happening to the user's work: saving, saved, unpublished,
  published.
- Write every string in `src/locales/en.json` and `it.json`; the editor
  starts in English, and `<html lang>` follows the editor's language.
  Measure a new string in both: an Italian label is often a third longer,
  and a tile or a button that fits one may clip the other.
- Keep a visible focus on everything focusable, and full keyboard use.
- Keep the person's own preferences (language, theme) in the account menu
  and the site's settings in `/settings`: the first follow the person to
  every site, the second are the site's and an editor may change none.
- Offer only what the person's role may do (`useCurrentSession().can()`,
  [docs/roles.md](../../docs/roles.md)): leave the control out rather
  than disable it, and where its absence would puzzle, say in one muted
  line who does it ("A Publisher puts it online").

Don't:

- Use a palette colour, an arbitrary size or an arbitrary z-index in a
  component.
- Put a second accent-filled button in the same view.
- Use colour alone to carry meaning (a state has a label or an icon too).
- Use `window.alert`, `window.confirm` or `window.prompt` (lint:
  `no-alert`).
- Animate for decoration, or animate layout properties
  (`width`, `top`); transitions stay on colour, opacity and transform.
- Use exclamation marks or "Oops" in messages; say what happened.

## 8. Responsive

The editor works down to 390 px wide: the sidebar becomes the top bar, and
any row that can overflow truncates (`min-w-0` on every flex ancestor
before `truncate` works). Below `sm` a dialog keeps a 1 rem margin on
each side (`max-w-[calc(100%-2rem)]`). The canvas
itself is used on larger screens; it must not break on small ones.

## 9. For agents

Before a UI change here:

1. Read this file and the primitive you are about to use.
2. Use tokens and primitives; if something you need is missing, add it to
   `styles.css` or `components/ui/` and to this file, not to one component.
3. Check light and dark, at 1440 and 390 px, on the running editor; run
   axe on what you changed.
4. Report measured values (contrast, sizes) rather than "looks right".
