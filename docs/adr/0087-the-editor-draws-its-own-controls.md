# 0087 — The editor draws its own selects and calendar, and saves in one queue

**Status**: Accepted — 2026-09-26

## Context

Three leftovers found together while working through the editor backlog.

**Selects and dates were the browser's.** Every `<select>` control and
the date fields were native, next to a Radix `Select` already used on six
screens. Two comments defended the native ones — type-ahead on a long list
and the phone's own picker for the country; "no date-picker library in this
workspace" for the dates. The result was an editor whose menus and date
fields looked and behaved differently from browser to browser, and whose
date fields could not be told which language to speak.

**Two editors saved without a queue.** Headers and footers, and reusable
sections, fired one request per change with nothing ordering them. An older
save could land after a newer one; Publish saved and published without
waiting for saves already on their way; restoring a version could be
overwritten by a save that left before it. The page editor had solved this
long before (`useSingleFlightSave`), and even there Publish did not wait for
the save the canvas had just flushed.

**Accessibility had never been measured.** axe-core, run over every editor
screen in both themes, found: sidebar lists holding a bare button and an
item outside any list; the Layers tree holding dnd-kit "buttons" instead of
list items, with the row's real buttons nested inside them; a 20px collapse
toggle; selects with no name on Cookies and Integrations; an unlabelled file
input on Imports; two text colours under the contrast minimum. Below 1024px
the editor had never been tried; at a phone's width the canvas screens
scrolled sideways by 124px and the top bar drew its columns over each other.

## Decision

- **`OptionsSelect`**, in `components/ui/select.tsx`: a select built from a
  list of options (or groups), with the empty "None" choice Radix cannot
  hold handled inside it. Every native select uses it, and `NativeSelect`
  is gone. Radix keeps type-ahead.
- **`DatePicker`**: a calendar in a popover (react-day-picker 10, MIT),
  speaking the editor's language. The stored value is still `YYYY-MM-DD`,
  read and written through the date's local parts so no time zone moves a
  day. Times stay time inputs. The month grid (`calendar.tsx`) is loaded the
  first time a calendar opens: react-day-picker brings date-fns, whose
  locale entry brings every language it has, and imported with the pages
  list it doubled the time the list took to appear. Its colours come from
  the theme through a scoped stylesheet, because the library sets its own
  outside any cascade layer.
- **`useDraftEditor`**: the draft/publish lifecycle of a block tree that is
  not a page, on the same single-flight queue as the page editor. It gives
  the canvas `whenSaved`; Publish and Restore wait for it. Publish in the
  page editor waits too, and refuses a draft whose save failed.
- **The accessibility findings are fixed, not waived**: every screen now
  reports zero axe violations (WCAG 2.2 A/AA) at 1440px in both themes, and
  at 768 and 390px. In the Layers tree the list item is what moves and a
  24px handle carries the keyboard drag; the collapse toggle is 24px, with
  the tree guides re-centred on it (the row height they used was 22 where
  rows measure 28). On a phone the canvas panels start closed and the top
  bar becomes two rows.

## Consequences

- One more dependency in the editor, react-day-picker (and date-fns under
  it). `pnpm audit` stays clean.
- Specs pick an option by opening the menu (`chooseOption` in
  `src/test/select.test-fixture.ts`): a Radix menu is only in the DOM while
  it is open.
