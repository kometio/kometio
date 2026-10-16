# Writing Kometio's user documentation

The rule this file exists to enforce: **the reader came to do something.**
Tell them how to do it. The reasoning behind the design is interesting to
us and it is not what they came for — it belongs in an ADR, or in one
short paragraph at the end.

This applies to the pages published on the docs site
(`themes/docs-showcase`), not to ADRs, which are the opposite by design.

## Every page answers five questions, in this order

1. **What will I be able to do when I finish?** One or two sentences,
   first thing on the page. Never open with history or a principle.
2. **When do I need this?** The situation that brings somebody here.
3. **What do I need first?** Prerequisites, plainly: a running
   deployment, an admin account, a terminal on the server.
4. **How?** Numbered steps. Every command and every file complete enough
   to paste. Say **where** each file goes, by path.
5. **How do I know it worked?** What the reader should see. A page that
   ends without this leaves somebody guessing.

Only then, optionally: **why it works this way**, one paragraph, or a
link.

## Rules that are not negotiable

- **Task titles.** "Install your theme on a server", not "Themes outside
  the repo". A title names what the reader is trying to do.
- **Complete snippets.** A file fragment with no path and no surrounding
  file is not documentation. Include the whole small file; for a big one,
  show the part that changes and name the file above it.
- **No unexplained jargon.** The first time a Kometio word appears —
  block, page group, region, term, variant — say what it is in half a
  sentence.
- **Say what is not possible.** If a thing has no in-product flow (today:
  uploading a theme), the page says so and gives the real procedure. A
  reader who discovers a gap by failing has been let down twice.
- **One page, one job.** If a page teaches two tasks, it is two pages.

## Italian is written, not translated

The Italian pages are read by Italian agencies. They must not read like
a translation.

- Write the Italian from the same knowledge, not from the English
  sentences. If a sentence only works as a calque, it is the wrong
  sentence.
- Short sentences. Address the reader directly and in the imperative:
  "apri", "crea", "incolla".
- Keep the English word where the product shows the English word (the
  UI, `theme.css`, `KOMETIO_THEME`) and translate everything else.
- No literal renderings of English idioms — "step" is _passo_, not
  _gradino_; "ship" is _distribuire_ or _includere_, not _spedire_.

## The shape of a task page

```
<Title: the task>

One or two sentences: what you will have at the end.
When you need this. What you need first.

## 1. <first step>
<command or file, complete>

## 2. <second step>
...

## What you should see
<the observable result>

## If it does not work
<the two or three real failure modes, and the fix>
```

A reference page (the block list, the style properties) is a table or a
list, not prose. A concept page is at most one screen and always links
to the task page that uses it.

## What a page looks like on the screen

The five questions say what a page contains. This is how it is set down, so
that somebody who is looking for one thing finds it without reading
everything:

- **A heading for every task or step**, nested: the page title is the
  `Heading` block at level 1, each step or section a level 2, a part of a
  step a level 3. Never bold text standing in for a heading: the page's table
  of contents and the search are built from the headings.
- **A list whenever there are three or more things of the same kind**: the
  field types a form offers, the ways to place a block, what a role may do.
  A sentence with four commas is a list that was not written as one. A
  **numbered** list for what is done in order; a bulleted one for what is
  not.
- **A table for a reference**: a block's fields, a theme file's tokens, the
  roles and what each can do. Columns that answer the question the reader
  came with, and nothing else.
- **A `Callout` for what must not be missed** (a step that cannot be undone,
  something that only works on a server) and for nothing else: a page where
  every third block is a callout has none.
- **A `Code` block for anything typed or pasted**, with the file's path
  above it. A command inside a sentence cannot be copied without its full
  stop.
- **Paragraphs of at most four sentences.** The first sentence of a
  paragraph says what the paragraph is about.
- **Buttons, menus and fields in bold, exactly as the editor writes them**
  in the language of the page (`apps/editor-app/src/locales/{en,it}.json`).

## English that says what it means

The English is read by people for whom it is a second language, and by
translation tools. Both do better with a sentence that commits:

- Name the thing, with the word the product uses: "the **Forms** section",
  not "the section for this".
- Say what happens, and when: "The page goes online at once" and not "The
  page is made available".
- Give the number, the path or the value: "up to 20 MB", "in
  `themes/my-theme/`", "after 24 hours".
- No "simply", "just", "easily", "etc.", "and so on": either it is easy and
  there is no need to say so, or it is not and the reader now doubts
  themselves.
- Say who does it. "Choose a theme" (you); "an administrator can turn this
  off" (somebody else).
- American spelling, as the editor.

The same rules, in their Italian form and with the words the product uses,
are in [ADR-0140](adr/0140-italian-is-written-and-english-is-specific.md).

## Where these pages live, and how one gets published

They are not files in this repository. The docs site is a Kometio site
(`themes/docs-showcase`) and every page is content in the database, which
is the point: we run on the thing we sell.

To change one you talk to the API as an authenticated user:

1. `PATCH /page-groups/:id/content` — the blocks, in the site's **default
   language** (English).
2. `PATCH /page-groups/translations/:id/field-values` — the Italian, as
   an overlay keyed by block id, with `parentGroupId` in the body.
3. `POST /page-groups/translations/:id/publish` — once per language.

Two things that are easy to get wrong and cost an hour each:

- **Find the existing page before writing.** Creating a second page with
  the same slug does not fail loudly; it gives the docs two pages at
  neighbouring URLs. Look it up by (parent, slug) and PATCH that group.
- **Every block needs an Italian entry.** A block missing from the
  overlay silently renders in English on the Italian page, which is worse
  than an obvious gap because nobody notices it.

Before touching the **block reference**, regenerate the inventory:

```sh
npx tsx tools/dump-block-inventory.mts > /tmp/blocks.json
```

It prints every block the picker offers, with its fields and its labels
in both languages, straight from the registry. A reference written from
memory is wrong the day somebody adds a block, and nothing breaks to say
so — the page just quietly stops listing one. What the page still has to
add by hand is what no registry knows: what each block is _for_.

A label the editor shows must be quoted in the language the reader is
reading: `apps/editor-app/src/locales/{en,it}.json` is the only source of
truth for what a button says. "Insert block" in an Italian sentence sends
somebody looking for a button that says _Inserisci blocco_.

## Checking the pages that are there

Nothing in a pull request can check these pages, because they are not in the
repository. `tools/check-docs-site.mts` stands where a test would: it logs in
to the API, reads every published page, and prints what is wrong with it. It
writes nothing.

```sh
KOMETIO_EMAIL=you@example.com KOMETIO_PASSWORD=… \
  pnpm exec tsx tools/check-docs-site.mts --api http://localhost:3000/api
```

It reports as **errors**, and exits 1, what the reader finds out first and
nobody notices: a page with no translation, a block whose text exists in the
default language and not in the other (the page shows it in English on the
Italian page, silently), a page that does not start with its title, a page
with two. It reports as **warnings** what makes a page hard to use: a
paragraph of more than four sentences, a sentence that lists four things (it
is a list), four paragraphs and no section heading, a page of a few words that
is not an index, "simply" and "just" and "etc." in the English, a name in bold
that the editor does not show in that language (the docs said "Edit
properties" for a button the editor calls **Properties**), and what
[ADR-0140](adr/0140-italian-is-written-and-english-is-specific.md) forbids,
read from `tools/locale-style-rules.json`: the same file the editor's own
texts are checked against. `--json` prints every finding.

Run it before you change a page and after, and read the count: a change that
leaves the warnings where they were has not made the pages better.
