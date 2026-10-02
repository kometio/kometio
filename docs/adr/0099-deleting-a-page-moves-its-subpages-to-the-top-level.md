# 0099 — Deleting a page moves its subpages to the top level

**Status**: Accepted — 2026-09-30

## Context

Deleting a page used to set its subpages' parent to nothing (`ON DELETE SET
NULL`) and leave each language's copy of the parent (`page_translations.
parent_group_id`) pointing at the page that was gone. The subpages then
answered 404 everywhere, and saving one failed when its slug was taken at the
top level (audit, 2026-09-29). The answer that day was to forbid the deletion
while a page has subpages (`ON DELETE RESTRICT`, API and editor). The screens
document written afterwards, and the owner, wanted the subpages to go up
instead.

## Decision

- **The pages directly under the one deleted move to the top level first.**
  `deletePageGroup` calls `movePageGroupToParent` for each of them, which
  re-addresses every language of the subpage in one write, and only then
  deletes the page. Whatever is under a moved subpage stays under it.
- **Every address is checked before anything is moved.** A subpage whose
  address, in some language, is already taken at the top level — by a page, a
  category or a term — refuses the whole deletion with
  `ChildPageAddressTakenError` (409), naming the slug and the language. Some
  subpages moved and the page still there is not a state to end up in.
- **`ON DELETE RESTRICT` stays.** It is the net for a subpage created between
  the check and the delete, and answers `PageGroupHasChildrenError` as before.
- **The old address does not redirect.** A moved page remembers where it hung
  (`formerParents`), but its old address began with the deleted page's own,
  which is gone: it answers 404, like the page it was under. The dialog says
  the current addresses "will no longer lead anywhere".
- **The dialog says how many move, whatever the list is showing.** Each list
  row carries `childCount` from the API — one grouped read for the page of
  results — so a page found by a search, whose subpages are not on screen, still
  asks the question with the right number. Names are given only when every one
  of them is on screen: half a list of names would read as the whole.

## Consequences

- Deleting a page can change other pages' addresses. That is stated before it
  is confirmed, and is refused rather than half done.
- The permission needed is the one deleting already needed: `delete` and
  `changeLiveSite` are the same two roles (docs/roles.md), so nobody can
  delete a page who could not have moved its subpages.
