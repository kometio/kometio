/**
 * The class a block hands to the component that draws its root for it —
 * ArticleNav to PrevNextNav, BuyButton to Button, MapEmbed to the consent
 * gate.
 *
 * Its own type class goes first, because the site-wide style of a type is
 * a rule on that class (block-style-overrides.ts): a buy button rendered
 * with nothing but `.kometio-button` on it ignored every style set for Buy
 * button. The instance class follows, as it always has.
 */
export function delegatedRootClass(
  typeClass: string,
  instanceClass: string | null | undefined,
): string {
  return instanceClass ? `${typeClass} ${instanceClass}` : typeClass;
}
