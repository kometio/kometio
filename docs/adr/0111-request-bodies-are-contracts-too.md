# 0111 — The request bodies of the HTTP API are contracts too

**Status**: Accepted — 2026-10-12. Amends [0096](0096-api-contracts-are-their-own-library.md).

## Context

[ADR-0096](0096-api-contracts-are-their-own-library.md)
moved the shapes the API **answers** with into `@kometio/api-contracts`. The
shapes it **accepts** stayed where they were: 19 `*.schemas.ts` files in
`apps/api`, each a comment away from saying that the wire contract is
"validated here, independently of how the use-case layer's own TS type
evolves". On the other side, the editor's `*-api-client.ts` files wrote the
body of each request again by hand, as an interface:

- `LegalDocumentAnswers` was declared three times (the API's schema, the
  use case's interface, the editor's interface), and each said it mirrored
  the others;
- 8 of the editor's 22 clients typed their bodies by hand, with nothing that
  fails when the API's schema moves.

A field added to the API's schema and not to the editor's interface was a
request the API refused at run time, found by a person.

## Decision

- **A request schema is in `@kometio/api-contracts`**, beside the record it
  concerns, named for the area (`legal-documents.ts`, …), with the response
  schemas the area's endpoints share. The API validates with it
  (`ZodValidationPipe`) and the editor's client types its body from it.
- **What only the server may do stays in the API**, layered on the shared
  shape: the sanitiser that every block content passes
  ([ADR-0046](0046-rich-text-as-sanitised-html-strings.md)) is a
  `.transform`, which needs the sanitising library and which a browser has
  no business running. The API's schema for such a body is the contract's
  shape with that field replaced (`.extend`), and the spec that walks the
  API's schemas for a path that lets a `<script>` through keeps finding them
  where it always did.
- **The use case keeps its own input type.** The API hands the parsed body
  to it, so the compiler holds the two to each other: a field added to one
  and not the other does not build. There is no third copy.
- **The editor's client may keep the names its callers import** and
  re-export them from the contract; what it does not do is declare a shape.
- Moved area by area, each as its own change, the contract's spec taking the
  API schema's spec with it.

## Consequences

- A change to what the API accepts is a change to a file the editor's
  client is typed from, and the editor's typecheck says what it breaks.
- `apps/api` no longer says "validated here, independently": a request the
  editor can build is, by construction, one the API's schema describes.
- The contracts library grows by the request shapes (about 1,000 lines
  across the 19 files); it is still free of anything server-only, which the
  `contracts` tag forbids it by lint.
