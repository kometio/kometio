# 0127 — Redirects: old addresses are answered by rules, and the list of what was not found writes them

**Status**: Accepted — 2026-10-14.

## Context

A site that moves to Kometio (from WordPress, from another builder, from
hand-written HTML) has addresses that people and search engines already hold:
`/?p=123`, `/2019/05/old-post`, `/category/news/page/2`. The new site's pages
live at other addresses. Without an answer for the old ones every inbound link is
a 404 and the ranking those links carried is gone — which is the cost of a
migration that an agency counts first, and the review of 2026-10-11 listed
(PRD-1): "blocking for any migration with SEO; the table does not even exist".

What existed was narrower: a page that is renamed or moved answers its former
address with a 301 (`formerSlugs`, `formerParents`, ADR-0074), and a page a term
claims answers at the term (ADR-0067). Both are about an address Kometio itself
once had. Nothing could say what an address from before Kometio is.

## Decision

- **A rule is an old address and what to do when it is asked for.** `redirects`
  holds, per site, the source (a path, and for WordPress's `/?p=123` the query
  pairs that must come with it), a target and an answer: permanent (301),
  temporary (302), or gone (410, no target). One rule per address
  (`redirects_site_source_unique`).
- **The target is a page, or an address.** A page is held by its id and language,
  so renaming it does not break the rule; an address is a path of this site or
  another site's. An address that is a page of this site (`/en/blog/post`) is
  **stored as the page** wherever it is typed or imported: it is the difference
  between a redirect that lasts and one that lasts until someone edits a slug.
  When the page is deleted the rule stays, says it needs a target
  (`ON DELETE SET NULL`), and answers nothing until it has one.
- **A pattern is one rule for many addresses.** `/:year/:month/:slug` takes a
  segment each, `/category/*` takes the rest; a target uses what the source
  names (`/en/blog/:slug`). Whole segments only (`/post-:id` is refused, not
  stored to match nothing), no query on a pattern. Among patterns the one with
  more literal segments wins, a `*` last, then the older. A pattern may also go
  to **one page** (`/old-shop/*` to the page that replaced the section): it
  takes nothing from the address then, and it is what a reorganised site needs
  most.
- **A page always wins**, as a page does over a term (ADR-0064). Rules are not
  asked on the path of a page that exists: the public site asks the API only
  after its own routes have come back with "not found" — and for the front door
  with a query, which no route answers. A rule on an address a page serves is
  therefore never reached, which is the correct reading of "a page is there".
- **The answer is one redirect.** A rule whose target is itself ruled is
  followed on the server, up to five steps, so that a page moved twice is one
  hop (a search engine counts the second against the first). A chain is not
  followed into a page that answers; a circle between rules is refused where it
  is written (`redirect:target:loop`) and is no answer where it is read.
  One pattern that matches its own output is not a circle: it answers where its
  output is a page and nothing where it is not.
- **The query is carried on.** A campaign's `?utm_source=` survives a redirect;
  what the rule itself asked by (`?p=123`) is left behind. A target that has its
  own query or anchor keeps only that.
- **What the site is asked.** `GET /public/redirects/resolve?domain&path&search`,
  throttled as the other public reads, answering a redirect, a gone, or a 404
  for "no rule". The matching is in `shared-types` (`redirect-rules`), so that
  the API's refusals, its answers, the editor's test and a typed address read
  the same: one reading of an address, for a rule and for a request (lower case,
  percent-decoded per segment, no trailing slash, no `index.php`).
- **The compiled rules of a site are kept for fifteen seconds** and invalidated
  by a write through the same process. Asked once per 404, and a site's 404s
  come in floods; a read of up to ten thousand rules per request would be a cost
  any visitor could make the server pay.
- **What was not found is counted and shown** (`missing_paths`): the path only,
  never the query, an address or a browser, capped per site, with the
  addresses only bots ask for (`/wp-login.php`, `/.env`) left out. This is the
  list a person turns into rules after a migration — each row has "Redirect…".
  An address a rule answers (an exact one, or one pattern for hundreds) is not
  on the list: it is judged against the rules when the list is read, since a
  miss is written seconds after it happened and a rule made in between would
  otherwise see its address come back. The one query ever kept is
  what a migrated site is asked at its front door (`/?p=123`), which is the
  whole of that address.
- **Counts are batched.** A rule used and an address missed are added to
  in-memory counters and written every ten seconds as `hits = hits + n`, so a
  crawler's 404s are not a write each and two processes flushing agree. A count
  lost in a crash is a visit not counted.
- **A list can be imported, and is judged before it is applied.** CSV with a
  header or without, `,` `;` or a tab, two or three columns (from, to, optional
  permanent/temporary/gone). Every row is judged on its own and a bad one is
  named by its line; a dry run answers in the shape of the real one; the same
  file twice is the same site (an address that has a rule is updated).
- **A WordPress move makes its rules from the export it was read from.** The
  analysis (ADR-0082) already streams every item of the file once; on the same
  pass it keeps, for each _published_ page and post, its number, slug, title,
  parent and the address it answered at (`import_jobs.permalinks`, its own
  column and never in a listing: it is as long as the site, where a report is
  a few hundred numbers; each part of an entry and the whole are bounded, at
  20,000 entries and eight million characters, because the file is somebody
  else's). From that and the pages the site has
  now, each item becomes up to two rules: its address, and its number
  (`/?p=123`, `/?page_id=45`), both to the page that took its place. The page
  is found by its slug — the one thing an import keeps — narrowed by who it sat
  under when two pages have it, and by the site's own language when it is in
  several; **what is still more than one is not guessed at** (a redirect to
  the wrong page is worse than none, because nothing says it is wrong). What has
  no page yet is listed, with a CSV to work from: making the page and asking
  again is the way to finish a move, and what was made is left as it was. It is
  judged first (a dry run in the import's own report) and is an administrator's,
  like the file it reads from. An export read before this was kept says so and
  has to be uploaded again.
- **A target is refused for what a browser would read as another host**: a
  `javascript:` or `data:` address, a `//host`, a credential, a control
  character and a backslash (`/\evil.example` is `//evil.example` to a
  browser). And **a deployment everybody signs in to (the public demo,
  ADR-0118) does not let a rule leave the site** (`redirect:target:external`):
  an address of the demo that sends a visitor anywhere is one anybody could lend
  to a phishing message. A page or a path of the site is still allowed there.
- **Rules travel with the site** (the archive of ADR-0105 carries `redirects`)
  and **the count of what was not found does not** (`missing_paths` is a
  moment's, like submissions). It is a publisher's: `changeLiveSite` to write,
  `delete` to delete (docs/roles.md).

## What it does not do

- **The site's own access log of a request is not a rule.** Whatever a theme or
  a proxy in front of Kometio does with an address is its own.
- **No regular expressions.** A pattern is segments and one `*`. A regex is a
  tool that a person writes wrong and cannot read back, and it cannot be
  checked for a circle; the two patterns WordPress needs fit.
- **No rules by host.** A rule is for the site, whichever name it was reached
  by. Two domains for one site are the same answer; a domain redirect belongs to
  the proxy in front.
- **A site holds at most 10,000 rules**: the set is read into memory to answer.
  A site with more is asking for the proxy's tool. A big move is two rules per
  page, so a site of five thousand posts is at the limit.
- **A WordPress move's archives are not made**: the categories, tags, authors
  and dates (`/category/news/`, `/2019/05/`). They have no page to be the
  answer of until the site's own category pages exist, and what visitors still
  ask for shows up in "Not found" to be answered by hand or by a pattern.

## Consequences

- A migration's inbound links can be kept without a plugin or a server file, and
  they move with the site in one archive.
- A new table of a site's own is a decision in `archive-tables.test.mjs`
  (`redirects` is a site's, `missing_paths` a moment's), as that test intends.
- The public site gains one call per 404 (and one for the front door with a
  query that is not a campaign tag), and none for a page that exists.
