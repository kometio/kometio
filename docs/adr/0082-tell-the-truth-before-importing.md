# 0082 — Tell the truth before importing

**Status**: Accepted — 2026-09-24

## Context

The WordPress importer was planned in September as one piece of work:
parse an export, write pages, report what did not fit. The plan's own
market research explains why it matters — the importers people use today
all fail the same way, quietly, and the differentiator was to be an
explicit quarantine and an honest report.

Before writing any of it, the reader here was pointed at two real client
sites rather than at fixtures. What they say changed the order of the
work.

|                                          | a custom-theme site   | a WooCommerce shop         |
| ---------------------------------------- | --------------------- | -------------------------- |
| export                                   | 6.5 MB, 1 274 entries | **314 MB, 43 597 entries** |
| pages and posts                          | 28                    | 29                         |
| of those, empty in the export            | **14**                | 5                          |
| blocks convertible                       | **37%**               | 82%                        |
| entries in types no import brings across | 117                   | **28 178**                 |

Neither is unusual. Both keep most of what a visitor sees outside
`post_content` — in ACF fields, in custom post types, in products — which
is the case the plan's research did not count, having measured Gutenberg
against Elementor.

Two things follow. The first is that no single number describes either
site: "82% convertible" flatters a shop that would leave 28 178 entries
behind, and "37%" slanders a site whose six real pages arrive perfectly.
The second is that whether the writing half is worth building at all is a
question with an answer, and the answer is measurable.

## Decision

### The analysis ships first, and on its own

Upload an export, get a report, import nothing. It is the plan's
differentiator in its purest form, it is useful by itself — an agency
deciding whether to migrate a client wants exactly this number — and it
turns "how much would this bring across" from a guess into a measurement
taken on real sites.

The report gives several figures rather than one, for the reason the
table above shows.

### The reader streams, and keeps postmeta keys without their values

A 314 MB export parsed into a document tree is most of a gigabyte of heap
for a report made of counters. Nothing holds more than the entry being
read: 28 MB of heap and four seconds for the largest file measured.

Two thirds of an export's weight is postmeta — 66 MB over two million
rows on that site — and nearly all of it is opaque plugin state. The
reader keeps the keys, which is what detection needs (`_elementor_data`
means a page builder, `_icl_*` means WPML), and takes a value only when
a caller names it.

### A block nobody has mapped is quarantine, never native

The classification table lives in `shared-types` and is shared with the
converter that will use it later. A report that promises what the
converter does not deliver is the same lie in a new place, so there is
one table, and its default is pessimistic.

### The upload ceiling is 512 MB, not the 200 the plan chose

314 MB is an ordinary client site, and it would have been turned away at
the door. Nothing loads the file, so the ceiling is about disk and
patience rather than memory.

### A job, in this process, watched by polling

Reading takes seconds, so the upload answers `202` with a job and the
editor polls it. In-process with no queue, which matches one API
container per site (ADR-0032) and adds no infrastructure. A job still
marked as running at start-up is marked failed with that reason: the
process that was doing the work is gone, and an editor polling it would
otherwise wait forever.

## Consequences

- Nothing is written to a site by this. The screen says so in its own
  first paragraph, because somebody about to upload their client's site
  should not have to infer it.
- The uploaded file is read once and deleted. The row keeps the report,
  which is kilobytes; keeping exports would mean keeping every export
  anybody ever tried.
- A report names a site's pages and the plugins it runs, so the table
  carries row-level security like every other tenant-scoped table.
- The two client exports stay off this repository. They were for
  measuring; the committed fixtures are hand-written.
- What the writing half should do is now a decision with evidence behind
  it — in particular whether a block that keeps its content in its own
  attributes, as every ACF block does, should surface those words in
  quarantine rather than arriving empty. On one of these two sites that
  is the difference between half the pages arriving and not.
