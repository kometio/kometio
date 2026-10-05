import { backToTopBehaviors } from './back-to-top';
import { beforeAfterBehaviors } from './before-after';
import { captchaBehaviors } from './captcha';
import { consentGatedEmbedBehaviors } from './consent-gated-embed';
import { cookiePreferencesBehaviors } from './cookie-preferences';
import { copyButtonBehaviors } from './copy-button';
import { countdownBehaviors } from './countdown';
import { embedHtmlBehaviors } from './embed-html';
import { formBehaviors } from './form';
import { collectionBehaviors } from './collection';
import { lightboxBehaviors } from './lightbox';
import { hamburgerMenuBehaviors } from './hamburger-menu';
import { hotspotBehaviors } from './hotspots';
import { productGalleryBehaviors } from './product-gallery';
import { promoBarBehaviors } from './promo-bar';
import { statBehaviors } from './stat';
import { tabsBehaviors } from './tabs';
import { termListBehaviors } from './term-list';
import { readingProgressBehaviors } from './reading-progress';
import { videoPlaylistBehaviors } from './video-playlist';
import type { BlockBehavior } from './types';

// Keyed by Block.type (see @kometio/shared-types), for the preview-bridge
// dispatcher (run-block-behaviors-in-subtree.ts) — re-runs a live-inserted
// or live-patched block's own client-side behaviors, which an innerHTML-
// style DOM update never executes on its own (see that file's own comment
// for why). Every block listed here also runs the exact same behaviors
// itself, once, from its own <script> at initial page load — this registry
// exists purely for the live-update case, it isn't the only place these
// run. Form and NewsletterSignup both register captchaBehaviors: either
// can render a captcha widget (Cloudflare's or the built-in one), and the guard
// of each makes registering it twice on one page harmless.
export const BLOCK_BEHAVIOR_REGISTRY: Record<string, BlockBehavior[]> = {
  Tabs: tabsBehaviors,
  HamburgerMenu: hamburgerMenuBehaviors,
  Countdown: countdownBehaviors,
  // Every collection wires the same engine (ADR-0052) — the behaviour
  // itself only matches the scrolling arrangements, so listing a block
  // that is currently a grid costs nothing and keeps working the moment
  // somebody switches it.
  ImageSlider: collectionBehaviors,
  Testimonials: collectionBehaviors,
  Team: collectionBehaviors,
  FeatureGrid: collectionBehaviors,
  PricingTable: collectionBehaviors,
  StatsCounter: collectionBehaviors,
  Carousel: collectionBehaviors,
  SocialLinks: collectionBehaviors,
  // Both offer a lightbox (ADR-0057) and share one behaviour — the
  // overlay, its focus trap and its Escape key exist once.
  Image: lightboxBehaviors,
  Gallery: lightboxBehaviors,
  BackToTop: backToTopBehaviors,
  PromoBar: promoBarBehaviors,
  BeforeAfter: beforeAfterBehaviors,
  Stat: statBehaviors,
  Form: [...formBehaviors, ...captchaBehaviors],
  NewsletterSignup: captchaBehaviors,
  VideoEmbed: consentGatedEmbedBehaviors,
  MapEmbed: consentGatedEmbedBehaviors,
  EmbedHtml: embedHtmlBehaviors,
  // Its links work without this; the behaviour only spares the round
  // trip, and re-runs after a live canvas insert like every other.
  TermList: termListBehaviors,
  ReadingProgress: readingProgressBehaviors,
  ProductGrid: collectionBehaviors,
  ProductReviews: collectionBehaviors,
  EventList: collectionBehaviors,
  ProductGallery: productGalleryBehaviors,
  // Both copy something — a code, the page's address — with one button.
  PromoCode: copyButtonBehaviors,
  ShareButtons: copyButtonBehaviors,
  CookiePreferences: cookiePreferencesBehaviors,
  BookingEmbed: consentGatedEmbedBehaviors,
  // Listened for on the picture, not on each point: a point added in the
  // canvas works without the picture being wired again.
  ImageHotspots: hotspotBehaviors,
  MasonryGallery: lightboxBehaviors,
  VideoPlaylist: videoPlaylistBehaviors,
};
