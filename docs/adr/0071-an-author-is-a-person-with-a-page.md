# 0071 — An author is a person, and has a page

**Status**: Accepted — 2026-09-13

## Context

An article's byline has been a name since the article blocks: the
display name of whoever created the page, never their email. A blog with
more than one writer needs more than that — who the person is, and
everything else they wrote — and the WordPress importer, which comes
next, brings author archives with it.

People already exist: they are the editor's users, with a role in the
admin panel. Nothing about them was public except that name.

## Decision

### The profile lives on the user, and the user edits it

`users` gains four things: an address (`slug`, with the addresses they
left in `former_slugs`), a bio per language (`bio`, jsonb keyed by
locale), and a picture (`avatar_storage_key` with its size).

There is no separate "author" entity. An author is a person who wrote
something; a second record to keep in step with the user would be one
more thing that goes stale.

Every role reaches `GET/PATCH /account/profile` and
`POST/DELETE /account/avatar`, and none of them takes a user id — the
only profile anyone can change is their own. Email and role are shown
there, not edited: one is how they sign in, the other is an admin's to
give.

A profile is written with `saveProfile` (name, address, bio) and a
picture with `saveAvatar`, never with `save`: `save` writes every column
as it was read, so a profile saved a moment after an admin changed the
person's role or switched them off would have put the old role or status
back — and a name saved while a picture uploaded, the old picture.

### The bio is asked for in the site's languages, and kept in the others

The profile screen shows one field per language the site publishes. A
language switched off keeps what was written in it: the editor sends the
stored bio back merged with the edited one, so turning French off and on
again does not erase anybody's French.

### The address is made for them, and follows the page rule

A person gets `giulia-rossi` the first time they have a name — on invite,
or on their first save — numbered around one already taken
(`giulia-rossi-2`), and at most 80 characters long. The migration gives
existing people theirs by the same rule as `slugify` (decomposed, accents
stripped), so `Antonín Dvořák` is `antonin-dvorak` in both. It does not follow a later rename: an address that
changed with every correction to a surname would break every link to it.
They can change it themselves; the old one goes into `former_slugs` and
answers with a 301, exactly as a renamed page does (PR #180).

An address is refused if anyone else has it now **or had it before**:
handing out a former address would turn a working redirect into a page
about somebody else. The database's unique constraint catches the race
the check cannot.

### The picture is the person's, not the site's

It is uploaded from the profile and stored like any image (re-encoded,
ADR-0013; the bytes decide it is one, ADR-0070; the library's 10 MB
ceiling for a photo), but it is **not** a row in the media library. A
library file can be deleted, renamed or reused by anyone editing the
site; a face attached to a byline should not disappear because somebody
tidied the library. `UploadMediaInput.siteId` became nullable for it:
neither storage adapter ever read the site, and a person writes for
every site of the tenant.

### The author page is a page, like a term's

`/{locale}/{word}/{slug}` — `/it/autore/giulia-rossi`,
`/en/author/giulia-rossi`. The word comes from `AUTHOR_PATH_SEGMENTS`,
keyed by the language subtag and written as a slug, with `author` for a
language whose word would not survive as one.

`PublishedAuthor` is `PublishedPage` plus the person, so
`PublicPageContent.astro` draws it with no new rendering path (the
ADR-0066 rule). Its default layout is two ordinary blocks: an
`AuthorBox` (the name as the page's `<h1>`, the bio, the picture, and a
schema.org `ProfilePage`) and a `PageGrid` listing their articles,
newest first.

The catch-all route asks for a page, then a term, then an author: what
an editor put at an address always wins over what the system made there.

### Only a person with an article has one

A page answers for someone still on the team (`isActive`), with a name,
an address no published page already answers at, and at least one
published article **in that language** — and an article is a page a
collection lists (the editor's News or Blog: an article is a page, and
the collection is where it is filed).
The admin who created the home page and the privacy policy is not an
author, and a page listing nothing is a page nobody should land on. The
sitemap and the hreflang alternates follow the same rule, so neither
ever lists an address that 404s — and so does a former address: it
redirects only to a page that answers, rather than 301 to a 404 and hand
out the new address, usually a name, of someone with nothing published.

### The address is kept free

A page an editor publishes at `/it/autore/giulia-rossi` wins the address,
as a page always does, and the person then has no page — rather than a
byline and a sitemap entry pointing at somebody else's page. A taxonomy
cannot take an author word (`autore`, `author`, `autor`… any language's)
as its prefix: its terms would sit at every author's address at once, on
every site, since a prefix is one word for all languages.

### Someone who leaves keeps their name, and only that

A deactivated person keeps their name on what they wrote — as the byline
did before this decision — and loses the rest: no picture, no bio, no
page. Those were theirs to publish while they were on the team, and
nobody else can take them down for them (an admin editing another
person's profile belongs with the granular permissions, not here).

### The byline and the box are filled, not typed

`AuthorBox` is a server-filled block like `ArticleMeta`: its only fields
are whether to show the bio and the link to the author page. On an
article, the render pass fills it from the page's creator; the byline in
`ArticleMeta` becomes a link to the author page when there is one. A bio
typed into a block would be a copy of the profile's, and the two would
part ways the first time the person edited it.

`PageGrid` gains `authorId` beside `termId` for the author page's list.
A grid that names a term lists the term.

### A filled block keeps its answer in the canvas

Found while verifying this: changing an option of any server-filled block
in the canvas re-rendered it from the editor's copy of its props, which
holds only the question — the byline vanished, the author box said the
author had no name, a page list went empty, until a reload. It had been
so for every such block.

`SERVER_FILLED_PROPS` now names, per block, which props ARE the answer.
The fragment endpoint copies those from the page as the server just
resolved it and keeps the rest as the editor sent them; the canvas waits
for the edit to be saved before asking, so a list whose term just changed
comes back with the new term's pages. Only that block is redrawn — the
alternative, reloading the canvas on every such edit, was correct but
flashed the page and lost the scroll each time.

## Consequences

- Email and role never reach the public API: `toPublicAuthor` is the one
  place that decides what of a person is published, and it has no field
  for either.
- "Who wrote this" is still "who created the page". Reassigning an
  article to another author is not possible yet; when the importer brings
  WordPress authors in, it sets `created_by` to the matching person.
- A person's page appears and disappears with their articles. Unpublishing
  someone's last article takes their page offline; that is intended.
- The sitemap reads only the people whose articles are published on the
  site, not every account of the tenant.
- Every author page resolves the site's page tree twice (once to decide
  the page answers, once for its list), the same cost a term page with a
  list already pays. Acceptable at the scale the rest assumes.
