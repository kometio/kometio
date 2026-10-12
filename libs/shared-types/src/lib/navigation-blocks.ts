import { z } from 'zod';
import { pickedPageSchema } from './block-values';

/**
 * Shared by every site-chrome block that can be scoped to a breakpoint
 * (Nav, HamburgerMenu, NavLink, LanguageSwitcher) — apps/public-site maps
 * this to the `kometio-visibility-desktop-only`/`kometio-visibility-mobile-only`
 * utility classes (src/styles/visibility.css); `'always'` applies neither.
 * A bare enum, not a wrapper object with its own fixed default, because
 * the sensible default differs per block — each block's own schema below
 * picks its own `.default(...)`.
 */
export const visibilitySchema = z.enum([
  'always',
  'desktop-only',
  'mobile-only',
]);
export type Visibility = z.infer<typeof visibilitySchema>;

/**
 * Nav's only prop today is `visibility` (docs/adr/0018 follow-up,
 * 2026-08-19): defaults to `'always'` because that was its behavior
 * before this field existed (a horizontal row that just wraps on narrow
 * screens) — existing content keeps rendering identically. Its content
 * lives entirely in `Block.children`.
 *
 * There is no Header/Footer block anymore (docs/adr/0018 follow-up,
 * 2026-08-19): a site_layout_section's `content` for kind='header'/'footer'
 * IS directly the list of Nav/Text/Image blocks that belongs inside the
 * <header>/<footer> tag — apps/public-site (PR3) supplies that tag itself
 * around the rendered list, it is never a Block. This also means it's
 * structurally impossible to drop a "footer" into the header editor (or
 * vice versa): there is nothing named that to drop.
 */
export const navPropsSchema = z.object({
  visibility: visibilitySchema.default('always'),
});
export type NavProps = z.infer<typeof navPropsSchema>;

/**
 * Shared by every block that can land inside a Nav's flex row (NavLink,
 * LanguageSwitcher, and now HamburgerMenu): "left" leaves it in normal
 * flow, "right" applies a margin-left:auto push in nav.block.tsx's
 * render — the standard CSS trick for splitting a flex row without a
 * separate alignment control on the Nav container itself. Per-item, not
 * per-container, by explicit user request: the concrete case is "links
 * on the left, language switcher on the right, or vice versa" within the
 * same Nav.
 */
export const navItemPositionSchema = z.object({
  position: z.enum(['left', 'right']).default('left'),
});
export type NavItemPosition = z.infer<typeof navItemPositionSchema>;

/**
 * A distinct block from Nav, not a responsive behavior bolted onto it
 * (explicit user request, 2026-08-19): Nav is the desktop link row;
 * HamburgerMenu is a separately placed block with its own icon and its
 * own NavLink/LanguageSwitcher children, so an editor can give mobile
 * visitors different content than desktop (e.g. a "call us" link that
 * isn't in the desktop Nav at all) — not just a collapsed copy of the
 * same links. Renders as a toggle that reveals a dropdown panel directly
 * under itself (apps/public-site's HamburgerMenu.astro). Carries both
 * `navItemPositionSchema` (it can now be placed *inside* Nav's own row,
 * left or right of the links — nav.block.tsx's slot allows it) and its
 * own `visibility`, defaulting to `'mobile-only'`: that was its hardcoded
 * behavior before this field existed, kept as the default so a
 * HamburgerMenu placed before this change keeps behaving the same way.
 */
export const hamburgerMenuPropsSchema = navItemPositionSchema.extend({
  visibility: visibilitySchema.default('mobile-only'),
});
export type HamburgerMenuProps = z.infer<typeof hamburgerMenuPropsSchema>;

/** No other editor-time config: the real links depend on which page the visitor is looking at (site.enabledLocales/translations of THAT page), a runtime fact the editor canvas doesn't have — see LanguageSwitcher.astro. */
export const languageSwitcherPropsSchema = navItemPositionSchema.extend({
  visibility: visibilitySchema.default('always'),
});
export type LanguageSwitcherProps = z.infer<typeof languageSwitcherPropsSchema>;

export const navLinkPropsSchema = navItemPositionSchema.extend({
  label: z.string(),
  linkType: z.enum(['page', 'url']),
  page: pickedPageSchema.nullable(),
  url: z.string(),
  /** An icon name resolved against the active theme's set (docs/adr/0023) — `null` = no icon. `.default(null)`: NavLinks already saved before this field existed do not have the key. */
  icon: z.string().nullable().default(null),
  visibility: visibilitySchema.default('always'),
});
export type NavLinkProps = z.infer<typeof navLinkPropsSchema>;

/**
 * A dropdown trigger for a one-level submenu (Nav > NavDropdown > NavLink)
 * — deliberately not a link itself: combining "click opens the submenu"
 * and "click navigates" on the same element is the classic mega-menu UX
 * conflict, so `label` is just the toggle text, with no linkType/page/url
 * of its own (unlike NavLink). Deliberately capped at one level of
 * nesting (its own slot only allows NavLink, not another NavDropdown) —
 * arbitrarily deep mega menus are hard to use on touch devices, one
 * level covers the common case (e.g. "Prodotti" revealing a handful of
 * category links).
 */
export const navDropdownPropsSchema = navItemPositionSchema.extend({
  label: z.string(),
  visibility: visibilitySchema.default('always'),
});
export type NavDropdownProps = z.infer<typeof navDropdownPropsSchema>;
/**
 * "Back to top" — no props beyond `visibility`. Its scroll-threshold
 * show/hide and smooth-scroll-to-top behavior live entirely in
 * apps/public-site's BackToTop.astro `<script>`, the same way
 * HamburgerMenu's open/close toggle has no prop of its own either — this
 * is display/interaction logic, not editor-configurable content.
 */
export const backToTopPropsSchema = z.object({
  visibility: visibilitySchema.default('always'),
});
export type BackToTopProps = z.infer<typeof backToTopPropsSchema>;

/**
 * Floating "chat on WhatsApp" button. `phoneNumber`/`message` build the
 * wa.me deep link directly in apps/public-site's WhatsAppButton.astro
 * (`https://wa.me/<phoneNumber>?text=<encodeURIComponent(message)>`) — no
 * format validation on `phoneNumber` here, same trade-off as NavLink's
 * `url`: the editor is trusted to enter it correctly.
 */
export const whatsAppButtonPropsSchema = z.object({
  phoneNumber: z.string(),
  message: z.string(),
  visibility: visibilitySchema.default('always'),
});
export type WhatsAppButtonProps = z.infer<typeof whatsAppButtonPropsSchema>;

/**
 * "Home > ancestor > ... > current page" trail. No `content` prop: the
 * actual chain comes from the published page's own `ancestors` (page
 * hierarchy, parentId) at render time, not from anything stored on the
 * block — same "editor canvas can't show real data" trade-off as
 * LanguageSwitcher. `homeLabel` is the only editor-configurable piece
 * (the link target itself is always the locale root, computed from
 * `locale` at render time, not stored here).
 */
export const breadcrumbPropsSchema = z.object({
  homeLabel: z.string().default('Home'),
  visibility: visibilitySchema.default('always'),
});
export type BreadcrumbProps = z.infer<typeof breadcrumbPropsSchema>;

/**
 * Dismissible announcement bar. Reuses NavLink's `linkType`/`page`/`url`
 * shape for its optional link, but not `navItemPositionSchema` — unlike
 * NavLink it never sits inside Nav's flex row, it's a standalone
 * full-width bar, so "left"/"right" has no meaning here. Dismissal is a
 * single fixed localStorage key ('kometio-promo-bar-dismissed',
 * apps/public-site's PromoBar.astro) with no per-message versioning: a
 * site owner who changes `message` after a visitor already dismissed the
 * old one won't have it reappear until that visitor clears localStorage —
 * an accepted limitation, not solved here.
 */
export const promoBarPropsSchema = z.object({
  message: z.string(),
  linkType: z.enum(['page', 'url']),
  page: pickedPageSchema.nullable(),
  url: z.string(),
  visibility: visibilitySchema.default('always'),
});
export type PromoBarProps = z.infer<typeof promoBarPropsSchema>;

export const searchBoxPropsSchema = z.object({
  placeholder: z.string().default('Cerca nel sito...'),
  visibility: visibilitySchema.default('always'),
});
export type SearchBoxProps = z.infer<typeof searchBoxPropsSchema>;
