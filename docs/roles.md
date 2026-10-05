# Roles: who may do what

Kometio has three roles. What each may do is one table,
`PERMISSIONS` in `libs/shared-types/src/lib/permissions.ts`. The API
guards its routes with it and the editor decides which buttons to show
with it, so the two cannot disagree. The decision is
[ADR-0093](adr/0093-who-may-do-what-is-one-table.md).

## The four permissions

| Permission       | Admin | Publisher | Editor | What it covers                                                                                                                                                                                                                                                                            |
| ---------------- | :---: | :-------: | :----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `editDrafts`     |  yes  |    yes    |  yes   | Changes nobody sees until someone publishes them: a page's blocks and texts, versions and rollback, previews, new pages and languages, templates, drafts of sections and of the header and footer, media uploads, legal-document drafts, AI-generated drafts                              |
| `changeLiveSite` |  yes  |    yes    |   no   | Publishing, and every change that shows online without a publish: a page's SEO, address, place in the tree, order, collection and terms; the header's "stick while scrolling"; which fields of a section a page may change; forms (they have no draft); collections, taxonomies and terms |
| `delete`         |  yes  |    yes    |   no   | Removing anything: pages, media, forms, sections, collections, taxonomies, terms                                                                                                                                                                                                          |
| `configureSite`  |  yes  |    no     |   no   | The site's own settings (general, SEO, languages, business info, form retention, style, cookie banner, integrations), its users, AI settings, themes, imports and the export of the whole site (it holds every account's password hash)                                                   |

The rule behind the table: **an editor's work reaches visitors only when
a publisher publishes it.** A change that goes live at once is a
publisher's even when it looks small, like a page's address or one term.

## In the API

A route that needs more than a signed-in user says which permission:

```ts
@Patch(':id/parent')
@Allowed('changeLiveSite')
async moveToParent(...) {}
```

`@Allowed` (in `apps/api/src/app/auth/allowed.decorator.ts`) adds
`RolesGuard` and the roles the table gives that permission. It goes on a
method. For a controller where every route needs the same permission,
put the guards on the class and the permission beside them:

```ts
@Controller('users')
@UseGuards(SessionAuthGuard, RolesGuard)
@RequiresPermission('configureSite')
export class UsersController {}
```

The class order matters: Nest runs class guards in the order they are
listed, and `RolesGuard` needs the session `SessionAuthGuard` reads.

`apps/api/src/app/permissions.integration.spec.ts` sends every guarded
route as each role and checks the answer. A new guarded route belongs in
it.

## In the editor

`useCurrentSession().can(permission)` answers from the same table. Use it
to leave out what the person may not do, not to show it disabled:

- A button, menu item or sidebar entry the role cannot use is not drawn.
- Where its absence would leave someone wondering, one muted line says who
  does it instead. The canvas says "A Publisher puts it online" where
  Publish would be, and the form editor says the same where Save would be.
- A value the role may read but not change is shown read-only, like a
  page's address in the languages dialog.
- A whole screen that is one role's job is guarded on its route with
  `requirePermission` (`src/routes/-require-permission.ts`). Someone who
  types its address is taken back to the dashboard.

While the role is still loading, or the request for it fails, `can`
answers no. A spec that renders a guarded component mocks the session
with `sessionAs(role)` from `src/test/current-session.test-fixture.ts`.
