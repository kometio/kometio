# 0084 — The free core offers only what it is

**Status**: Accepted — 2026-09-25

## Context

Kometio is about to be shown in public for the first time: an announcement,
a site that explains the product, and a second Kometio instance anyone can
open and build a page in. That second instance is not a demo beside the
announcement — it **is** the announcement. Whoever arrives opens the block
picker, and what is on that shelf is the claim about what this product is.

Two things on the shelf today say something nobody intends to say.

**Sixteen blocks that talk about money.** They arrived with the
hundred-blocks plan, and the business decision about them was taken
before they were finished: everything that deals in money belongs to a
paid module, not to the free core. Left in the picker, the announcement
claims an e-commerce CMS that does not exist — there is no cart, no
checkout, no order, no stock. The blocks draw a product; nothing sells
one.

**The WordPress import.** It is merged and it works, but only the half
that reads: it analyses an export and reports what would come across.
The half that writes is deliberately deferred. Offering it inside the
editor means offering somebody who has already signed up a report about a
migration they cannot run. That report is worth a great deal — but
_before_ choosing Kometio, which makes it material for the site that
explains the product, not a screen in the product.

Both are cases of the same thing: the core registering more than it
offers. Neither should be deleted — the code is good, and one of them has
a paid module waiting for it.

## Decision

**A list of the types the free core registers but does not offer**,
`COMMERCE_BLOCK_TYPES` in `@kometio/shared-types`, holding ten:
`BuyButton`, `DiscountPrice`, `ProductCard`, `ProductGallery`,
`ProductGrid`, `ProductReview`, `ProductReviews`, `ProductVariants`,
`PromoCode`, `ShippingReturns`.

**Hidden, not removed.** The descriptors stay registered. A page that
already holds one still renders, still opens in the inspector, still
publishes; only the shelf it was taken from is gone, so no new one can be
added. `usePageBlockRegistry` filters the picker's categories and leaves
`registry` whole — the filter runs _after_ the theme has been merged in,
so a theme shipping its own shop block brings the category back with it.

**A list rather than a flag on each descriptor.** The question it answers
— what counts as commerce — is still open, and it is an argument easier
to have in front of one file than spread across sixteen. `@kometio/shared-types`
rather than `@kometio/block-registry` because that package is React and
editor UI; this is the same arrangement `SEARCHABLE_BLOCK_TYPES` and
`BLOCKS_WITHOUT_SEARCHABLE_TEXT` already use, guard included.

**Six blocks are deliberately not on the list**, because "talks about
money" is not the same as "is a shop": `PricingTable`/`PricingPlan` (every
product and service site has a prices page, Kometio's own included),
`ComparisonTable`/`ComparisonRow` (comparing two things is not selling
them), `PromoBar` (a site-wide announcement, whatever it announces) and
`TrustBadges` (reassurance, as common on a service site as on a shop).
Three of those were filed under `shop`; they move to `content` and
`conversion`, which leaves the shop bucket holding **exactly** the hidden
ten — so the filter empties it and the picker shows no Shop drawer at
all, rather than a drawer with three leftovers in it.

**The import is no longer offered in the sidebar.** `/imports` stays a
route, still admin-only, still reachable by typing the address: whoever
owns the deployment keeps the analysis.

**Two guards, in `block-registry`'s `config.spec.ts`**, the one place
allowed to know both the list and the registry:

1. the list names only types this registry actually has — rename a block
   or misspell a name and it would still type-check while the block it was
   meant to hide came back;
2. no block that is still offered accepts a hidden one as a child. The
   picker is not the only way in: a collection container adds a child of
   its single `allowedChildTypes` with no picker at all.
   `ProductGrid`→`ProductCard` and `ProductReviews`→`ProductReview` are
   both entirely inside the hidden set today, and this is what keeps it
   that way.

## Consequences

Reversing any of this is deleting a line. That is the point: the module
that will claim these blocks has not been designed — whether it is built
on Medusa.js or on its own is undecided — and the agreed destination,
moving them out of the core package entirely, would mean guessing the
shape of a seam that does not exist yet. This is the cheap, reversible
step that makes the product honest in public first.

What it costs is that the core now has a category which is empty by
construction, and a route nothing links to. Both are documented where
somebody would look: the bucket in `config.ts` says why it is whole, and
`admin-shell.tsx` says in full how to put the nav item back.

No site has to migrate. There are no Kometio sites in the world yet beyond
the ones in this project, and even if there were, a hidden block is still
a rendered block.
