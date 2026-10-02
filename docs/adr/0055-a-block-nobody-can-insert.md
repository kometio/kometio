# 0055 — A block nobody can insert

**Status**: Accepted — 2026-09-08

## Context

Eight blocks were added across [ADR-0052](0052-collection-arrangement-as-a-value.md),
[ADR-0053](0053-essential-blocks-and-brand-icons.md) and
[ADR-0054](0054-hosted-video-and-audio.md). They were written, given
descriptors, wired into `BlockRenderer`, covered by unit tests, rendered
and measured in a real browser, and merged with CI green three times over.

**None of them appeared in the editor.**

`pageBlocks` in `libs/block-registry/src/lib/config.ts` is the list the
block picker is built from, and none of the eight was in it. Being
exported, rendered and tested is not the same as being reachable, and
nothing in the codebase said so.

It surfaced only because the user asked a plain question — _are the new
blocks actually there?_ — which is not a question any check was asking.

## Why nothing caught it

Every invariant that could have started **from `pageBlocks`**:

- `pageBlockCategories` must match `pageBlocks` exactly — both were
  missing the same eight, so they matched.
- `stylableProperties` must line up with `BLOCK_STYLE_DEFAULTS` — it
  iterates `pageBlocks`.
- `container-type.spec.ts` derives the container list from the registry —
  from `pageBlocks`.

A block outside that list was outside every check at once. The absence was
consistent, which is exactly what made it invisible.

## Decision

**An invariant that starts from the files on disk, not from a list.**
`config.spec.ts` reads `blocks/*.block.ts`, extracts each declared `type`,
and fails — naming the file and the type — if it appears in neither
`pageBlocks` nor `headerFooterBlocks`. A guard test asserts the extraction
found a type in every file, so the check cannot pass by finding nothing.

Registering the eight then made three further defects visible immediately,
all of which had been hidden by the same absence:

1. **`Divider` declared `marginTop`/`marginBottom`** as stylable
   properties. Those two are instance-only and have no theme default, so
   the `BLOCK_STYLE_DEFAULTS` invariant rejects them — it had never seen
   this block.
2. **`Slider` collided with `ImageSlider`.** `blockTypeToClassName`
   derives `.kometio-slider` from the type, and `ImageSlider` already owns
   that class. Two blocks cannot share one, so the block is now
   **`Carousel`** — a rename with a reason, not a preference.
3. **`Carousel` and `SocialLinks` declared no `container-type`.** Both
   hold other blocks, and without that declaration a container query
   inside them never matches — silently, which is the failure mode
   [ADR-0047](0047-canvas-styling-architecture.md) exists to prevent.

The eight were also missing from `CORE_BLOCK_TYPES`, the list that stops a
theme defining a block with a core block's name.

## Consequences

The block count of 59 was, in practice, 51. That figure had been reported
as a result three times.

The general lesson is about the shape of a check, not about this list: an
invariant that starts from a registry can only ever verify things already
in the registry. Where "everything that exists must be registered
somewhere" is the property that matters, the check has to start from
whatever _defines_ existence — here, the files.

A second, sharper lesson about verification. The problem was first found
by parsing `config.ts` with a regex, then apparently disproved by running
the real code and seeing all eight present — and that reversal was wrong.
The code being run was the working tree, which already carried the
uncommitted fix; the committed branch did not. Executing beats parsing,
but only when what executes is what shipped.
