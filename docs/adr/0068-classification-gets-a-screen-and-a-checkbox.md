# 0068 — Classification gets a screen, and a page gets a checkbox

**Status**: Accepted — 2026-09-09

## Context

ADR-0064 to ADR-0067 gave classification a schema, an API, public routes
and its SEO. Everything worked and nothing could be done without `curl`.
This is the editor half, and it closes Fase 8.

## Decision

### Dimensions live on their own screen

Not a tab of the page editor. A dimension outlives any one page, and half
the point of the model is that the same terms will later classify things
that are not pages at all (ADR-0064) — putting it inside the page editor
would say the opposite.

### The address is shown next to the name, never behind a toggle

A term's slug is the reason the whole feature exists. Hiding it under an
"advanced" section is how somebody publishes fifty terms and only then
notices what their URLs say.

Per language, side by side with the name, because a term is reachable in
one language and not in another — and an **empty slug field is not an
empty address**: it means the term is not published in that language at
all, which the API models as the key being absent from the map. The
placeholder says so in words.

### The three states of a prefix survive the form

Absent, `null`, or a string — "derive one from the name", "mount at the
site root", "use this" (ADR-0064). A form that sends an empty string for
the first two would ask for an empty URL segment. The checkbox and the
empty field are therefore different answers, and the view sends
different bodies for them.

### A term is never offered a parent it cannot have

The API refuses a term as its own descendant (ADR-0065). The select
leaves that whole branch out rather than offering a choice that comes
back as an error: a control that can produce an error the user cannot
predict is a control that teaches nothing.

### A page's classification is one dialog, and it says who it belongs to

Ticking a box saves immediately, sending the **whole set** — that is what
the endpoint takes and what the editor knows: the boxes that are ticked,
not which one changed.

The dialog says out loud that the classification is shared by every
language of the page. It is on the page GROUP (ADR-0064), so ticking a
box on the English version changes the Italian one, and a person has no
way to guess that from a checkbox alone.

### Two selects on one screen do not share a name

The term row's parent select and the new-term form's are both "Inside".
Same words, different jobs — so the second says "Inside (for the new
term)". Two identical accessible names on one screen is a bug for anyone
using a screen reader, and it was a test that could not tell them apart
that made it visible.

## Consequences

- Fase 8 is complete: schema, API, public routes, SEO, editor. What the
  plan lists next is Blog/News and the filters, both of which build on
  this.
- A term's SEO block and its landing page are settable through the API
  and not yet through this screen. Named rather than hidden: the term's
  own metadata is the smaller half, and the landing page needs a page
  picker that today only exists inside the canvas.
- Verified in a real browser against the real API: a dimension created
  from the form derived its prefix, two terms were added with the second
  nested under the first (indent and `parentId` both), a term was ticked
  onto a real page from the page editor's dialog, and the public term URL
  then listed that page. All of it removed afterwards, tables back to
  zero, session revoked.
