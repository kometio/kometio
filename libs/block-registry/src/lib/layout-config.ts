import type { BlockDescriptor } from './field-types';
import * as blocks from './blocks';

/**
 * Shared by both the Header and Footer editors (docs/adr/0018): the
 * `content` of a site_layout_section for kind='header'/'footer' is
 * directly this list of blocks — there's no wrapper Header/Footer
 * block, the <header>/<footer> tag is provided by apps/public-site
 * (PR3), never saved as a Block. A single registry, not two, because
 * both editors offer the exact same palette; what makes one "the
 * header" and the other "the footer" is the `kind` on the entity being
 * edited, not anything visible here. A non-technical editor
 * structurally cannot drag a Hero/Gallery/Form (or a "footer" block —
 * no such component exists) into either one: it simply isn't in this
 * list, no separate runtime validation to keep in sync.
 *
 * 11 blocks total: 8 exclusive (below) + Text/Image/SearchBox reused
 * from @kometio/block-registry's config.ts (same descriptors, same Astro
 * component — no duplication). Breadcrumb is NO LONGER here (moved
 * among the page blocks in config.ts, 2026-08-22): it's intrinsically
 * per-page content (depends on the page's position in the hierarchy),
 * editing it as part of the shared Header/Footer — even though it
 * "worked" thanks to ancestors/currentPageTitle passed dynamically by
 * BlockRenderer — conceptually made it a page block disguised as a
 * shared section block.
 */
export const headerFooterBlocks: BlockDescriptor[] = [
  blocks.navBlock,
  blocks.navLinkBlock,
  blocks.languageSwitcherBlock,
  blocks.hamburgerMenuBlock,
  blocks.navDropdownBlock,
  blocks.textBlock,
  blocks.imageBlock,
  blocks.promoBarBlock,
  blocks.backToTopBlock,
  blocks.whatsAppButtonBlock,
  blocks.searchBoxBlock,
  // ADR-0056. A call to action in the header is something every site has,
  // and until now the palette had no button at all — the only way to get
  // one was a NavLink, which is a menu item and reads as one.
  blocks.buttonBlock,
  // The header and footer stacked their blocks in a plain `flex-col` and
  // nothing else: two columns in a footer, or a row of links beside a
  // logo, were not expressible. These are the same layout blocks a page
  // has, and a footer is a layout problem like any other.
  blocks.containerBlock,
  blocks.columnsBlock,
  blocks.columnBlock,
  // A row of social icons is a footer's most common single element.
  blocks.socialLinksBlock,
  blocks.socialLinkBlock,
  // A rule between the footer's sections, deliberate space, and a
  // standalone icon — all three belong wherever content does.
  blocks.dividerBlock,
  blocks.spacerBlock,
  blocks.iconBlock,
];
