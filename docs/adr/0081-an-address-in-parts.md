# 0081 — An address in parts, and a country that is a code

**Status**: Accepted — 2026-09-24

## Context

ADR-0014 gave a site its business information for schema.org's
`LocalBusiness`, and made the address one free-text field. The comment
that shipped with it said what the trade-off was: schema.org accepts a
plain string for `address` too, "just with less structure than Google's
Rich Results guidelines recommend. Revisit if that ever becomes a real
limitation."

It is one. Nothing can tell the town from the street in
`"Via Roma 1, 00100 Roma"` — not a search engine reading the page, and
not this codebase, which had three consumers all doing the only thing a
string allows: printing it whole.

The same field is also the reason the Contact details block could only
ever draw one line, and the reason a site's country was whatever its
owner happened to type — "Italia", "italia", "ITA" — in the one field
schema.org specifies as a code.

## Decision

### Four parts, each allowed to be empty

`street`, `postalCode`, `city`, `country`, with the address as a whole
nullable. Someone who knows only the street types only the street; an
address with nothing in it is no address, and is stored as `null`.

Deliberately **not** `addressRegion`. Google reads it for some countries
and it is a fifth question in a dialog that is already long; it can be
added later without moving anything, which is not true of the four.

### The country is stored as an ISO code

`IT`, not `Italia`. It has two jobs a typed name cannot do.

- schema.org's `addressCountry` is specified as the code, so a name there
  is data a machine cannot use.
- The order of the lines depends on the country: "London SW1A 1AA" and
  "20121 Milano" put the postcode on opposite sides of the town.

The picker offers the ~250 codes and lets `Intl.DisplayNames` name them,
in the editor's language and again in each published language — so one
stored `IT` prints "Italia" on the Italian page and "Italy" on the
English one. No table of country names to translate, to keep current, or
to get wrong.

A code that is not one this product offers prints as stored rather than
as a name. `Intl.DisplayNames` answers "Unknown Region" for `ZZ`, which
on a real contact block reads worse than two letters and hides that
something is wrong.

### The column becomes jsonb, and what was typed is kept

`sites.business_address` moves from `text` to `jsonb`, with the old value
landing in `street`. Parsing a line of prose into fields would be
guessing, and a wrong guess is worse than an incomplete address: until
someone fills in the rest, the site prints exactly what it printed
before.

## Consequences

- schema.org emits a real `PostalAddress` with only the parts that were
  filled in. A node asserting `addressLocality: ""` claims the town is
  empty, which is a different statement from not making one.
- The Contact details block prints the lines of an envelope; the sticky
  bar and the map link take the same address on one line, which is all a
  map search wants.
- The legal-documents wizard prefills one line too: a legal document
  writes an address into prose ("con sede in …"), not onto an envelope.
  It stays editable there, like every other prefilled answer.
- `LegalDocumentAnswers.address` stays a string, on purpose. It is what
  someone will sign, not a record of where the business is.
- The postcode-after-town rule is a short list of countries, not an
  address-format database. There are libraries that hold one; it is a
  large dependency for one line of output, and the list can grow the day
  somebody reports a country it reads wrong.
