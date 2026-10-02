/**
 * The block types the free core registers but does not offer (ADR-0084).
 *
 * Kometio's core is free and everything that talks about money belongs to a
 * paid module — a decision taken before any of these blocks existed, and
 * the reason they are here rather than deleted: the code stays, ready for
 * the module to claim it.
 *
 * **Hidden, not removed.** Every one of these is still a registered
 * descriptor: a page that already holds one still renders, still opens in
 * the inspector, still publishes. What changes is only that the picker
 * stops offering them, so no new one can be added. Removing them would be
 * a different decision with a migration attached; this one is reversible
 * by deleting a line.
 *
 * **A list rather than a flag on each descriptor**, deliberately. The
 * question this file answers — *what counts as commerce?* — is still
 * open, and it is an argument that is easier to have in front of one file
 * than spread across sixteen. It is also the inventory the module will
 * eventually take with it: the agreed destination is moving these out of
 * the core package entirely, which is a bigger change that would have to
 * guess at the shape of a module nobody has designed yet.
 *
 * **Why it lives here and not in `@kometio/block-registry`**, which is where
 * the descriptors are: that package is React and editor UI, and this has
 * to be readable from anywhere — the same arrangement
 * `SEARCHABLE_BLOCK_TYPES` and `BLOCKS_WITHOUT_SEARCHABLE_TEXT` already
 * use, right down to the anti-drift guard living in `block-registry`'s
 * `config.spec.ts`, the one place allowed to know both sides.
 *
 * **What is deliberately NOT here**, because "talks about money" is not
 * the same as "is a shop":
 * - `PricingTable`/`PricingPlan` — every product and service site has a
 *   prices page, including Kometio's own.
 * - `ComparisonTable`/`ComparisonRow` — comparing two things is not
 *   selling them.
 * - `PromoBar` — a site-wide announcement, whatever it announces.
 * - `TrustBadges` — guarantees and reassurance, as common on a service
 *   site as on a shop.
 */
export const COMMERCE_BLOCK_TYPES: readonly string[] = [
  'BuyButton',
  'DiscountPrice',
  'ProductCard',
  'ProductGallery',
  'ProductGrid',
  'ProductReview',
  'ProductReviews',
  'ProductVariants',
  'PromoCode',
  'ShippingReturns',
];

/** Whether the free core hides this type from the picker — see `COMMERCE_BLOCK_TYPES`. */
export function isCommerceBlockType(type: string): boolean {
  return COMMERCE_BLOCK_TYPES.includes(type);
}
