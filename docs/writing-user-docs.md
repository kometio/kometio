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
