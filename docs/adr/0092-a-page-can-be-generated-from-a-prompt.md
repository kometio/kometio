# 0092 — A page can be generated from a prompt

**Status**: Accepted — 2026-09-29

## Context

Every competitor in Kometio's tier now writes a first draft of a page from a
sentence. Without it, an empty canvas is where somebody new to Kometio stops.
Four facts shape how Kometio can do it:

- A page is a tree of the site's own blocks, each with a props schema
  (`BLOCK_PROPS_SCHEMAS`, 116 types). What a model writes has to become
  that tree, or the page is not editable like any other.
- The site is self-hosted. Kometio has no account of its own at any
  provider to pay for somebody else's pages, and some owners will want a
  model on their own machine.
- A model invents. A testimonial with a real-sounding name, a price, a
  figure, published unread, is a false statement made in the owner's name.
- Structured output in Claude's API accepts no recursive schema and no
  `minimum`/`maximum`, and wants `additionalProperties: false` everywhere.

## Decision

- **Two providers behind one port.** `PageGeneratorPort` has a Claude
  adapter (`@kometio/anthropic-page-generator`, streaming, prompt caching,
  `claude-opus-5` by default) and an OpenAI-compatible one
  (`@kometio/openai-compatible-page-generator`) that reaches OpenAI, Ollama
  or anything speaking that API at an address the admin gives.
- **The site brings its own key, sealed.** An admin sets provider, model,
  address and key in Integrations. The key is sealed with AES-256-GCM
  (`@kometio/aes-secret-cipher`, format `v1.<keyId>.<iv>.<tag>.<ct>`, version
  and key id as associated data) before it reaches `site_ai_settings`
  (tenant RLS). The sealing key is a file generated on first start in its
  own volume, or `KOMETIO_SECRETS_KEY`; a database backup alone opens
  nothing. The editor sees the last four characters, never the key. With
  neither variable set, the feature is off and the editor says so.
- **The model writes a flat list; the server builds the tree.** The model
  answers `{blocks: [{ref, parent, type, props}]}`, which needs no
  recursion. `assembleGeneratedPage` checks each block against a
  **generation catalogue** of 35 types (what each is for, which props the
  model writes, what it may hold, whether it stands at the top level) and
  against the block's real props schema, rebuilds the tree, gives ids, and
  drops what does not fit with a reason (unknown type, invalid props, a
  parent that does not hold it, over 120 blocks). A bad block costs that
  block, not the page.
- **Facts the model cannot know are placeholders.** Names of people,
  roles, prices are filled by the server with evident placeholders
  (`[Customer name]` / `[Nome del cliente]`), and a figure is left at 0.
  Nothing is published: the page arrives as a draft. Layers marks every
  block still holding one, and Publish asks before sending them out.
- **Icons only if the theme draws them.** The model may name an icon; the
  editor removes any the active theme's set does not have before the page
  reaches the canvas.
- **One flow, three doors.** "Generate with AI" in the canvas bar and in
  the middle of an empty page opens one dialog: a description, add to the
  end or replace the page (asked first), progress as it is written. The
  New page dialog offers "Describe it to AI"; the editor then writes the
  page as soon as its canvas can take it. The result is one step of the
  canvas history: undo takes it back, and version history keeps what was
  there. A linked translation cannot be generated into, because its blocks
  are the original's.
- **Streamed, bounded, cancellable.** `POST /sites/:id/generate-page`
  answers with server-sent events (`progress`, then `done` or `error` with
  a failure code the editor turns into a sentence); closing the dialog
  aborts the request to the provider. What can be refused before the
  provider is asked is an answer of its own, not an event: 404 for a
  site that is not the tenant's or a deployment with generation off, 409
  with the failure code as the message for a site with no provider, a
  key that no longer opens, or two pages already in flight. The editor
  says both the same way. What one site can spend is capped:
  ten requests a minute per client, two in flight per site, four minutes
  each, 16,000 output tokens with Claude and no automatic retries (a retry
  can be billed twice), 200,000 characters from any other server.
- **The API does not become a way into its own network.** An
  OpenAI-compatible address inside the network (loopback, private ranges,
  link-local, where cloud metadata answers) is refused unless the operator
  sets `KOMETIO_AI_ALLOW_PRIVATE_HOSTS=true` for a model on their own
  machine. The check is made on the address connected to, inside the DNS
  lookup of the connection itself, so a name cannot resolve to a public
  address when checked and a private one when used; redirects are not
  followed; an address with a user or password in it is refused, since it
  would be stored in the clear.
- **What the model writes is untrusted.** A link it writes may only be
  `http(s)`, `mailto`, `tel` or have no scheme (`isLinkableUrl`, which the
  public site now applies to every link a block carries); what it names is
  reported back bounded, without control characters.
  `GET` on the same path tells every editor whether it can work (`ready`,
  `not-configured`, `server-disabled`) without showing the settings.
- **What the model is told is split for caching**: a stable part built
  once from the catalogue, then the site, the language and, when adding to
  a page, its outline.

## Consequences

- A site pays its own provider; Kometio carries no AI cost, and the public
  playground runs with generation off.
- Adding a block to what can be generated is an entry in
  `generation-catalog.ts`; a test holds the catalogue's nesting against
  the editor's registry.
- Losing the secrets volume loses the keys, not the sites: an admin types
  the key again. Backing it up is the operator's job
  (docs/self-hosting.md).
- Someone running a model on the same machine sets one variable, and is
  told so by the editor when it is missing.
- Not done here: generating into an existing section in place, images,
  and a model choosing a theme variant. Each can follow on the same
  catalogue.
