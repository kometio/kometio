import {
  PAYMENT_METHODS,
  resolveColumnSpans,
  type Block,
} from '@kometio/shared-types';
import type {
  PublishedPageAncestor,
  PublishedPageTranslation,
  PublishedSite,
} from '@kometio/api-contracts';
import { resolveIconSvg } from './resolve-theme-icons';

/**
 * What BlockRenderer knows about the block it is drawing and the page
 * around it. `locale`/`translations`/`site` are threaded through every
 * recursive call rather than looked up again per block: a leaf has no way
 * to reach back up to the page-level values otherwise, and a LanguageSwitcher
 * can sit inside a Nav (docs/adr/0018). `ancestors`/`currentPageTitle` follow
 * the same reasoning for Breadcrumb.
 */
export interface BlockRenderContext {
  /**
   * The block being rendered. Needed by a container whose own layout
   * depends on its children — Columns resolves one grid track per child
   * column (ADR-0050), and it cannot see them from inside its `<slot/>`.
   */
  block: Block;
  locale: string;
  translations: PublishedPageTranslation[];
  site: PublishedSite;
  ancestors: PublishedPageAncestor[];
  currentPageTitle: string;
  editable?: boolean;
}

/**
 * The props EVERY block component is handed besides its own, core or a
 * theme's override alike. A component reads the ones it wants and ignores
 * the rest: the dispatch used to keep a flag per type saying which of them
 * to pass (`locale` on 68 of 116, `editable` on 16 more), a second list of
 * what each component's own `Props` already says. Nothing spreads its props
 * into markup — `block-components.spec.ts` holds that — so passing one a
 * component does not read changes no output.
 */
export function commonBlockProps(context: BlockRenderContext) {
  return {
    locale: context.locale,
    editable: context.editable,
    site: context.site,
    translations: context.translations,
    ancestors: context.ancestors,
    currentPageTitle: context.currentPageTitle,
  };
}

/** Props a block needs that are worked out from the tree or the site, not stored in it. */
type ComputedProps = (context: BlockRenderContext) => Record<string, unknown>;

/**
 * The blocks with something to be computed for them, by type. A container
 * that `rendersFromChildren` is handed `items` without an entry here
 * (`block-dispatch.ts`); an entry here is for what is not that.
 */
export const COMPUTED_BLOCK_PROPS: Readonly<Record<string, ComputedProps>> = {
  // One track per child column, resolved together: a column with no
  // width of its own takes an equal share of what the others left, so
  // the answer depends on all of them at once (ADR-0050).
  Columns: (context) => ({
    columnSpans: resolveColumnSpans(context.block.children),
  }),
  // Its element's id is what the glossary's index links to.
  GlossaryTerm: (context) => ({ blockId: context.block.id }),
  // Logos from the brand set, resolved here for the reason `iconSvg` is:
  // a block never reaches into the icon registry itself.
  TrustBadges: (context) => ({
    paymentIcons: Object.fromEntries(
      PAYMENT_METHODS.map((method) => [
        method,
        resolveIconSvg(`brand:${method}`, context.site.themeName),
      ]),
    ),
  }),
  ShareButtons: (context) => ({
    pageTitle: context.currentPageTitle,
    brandIcons: {
      whatsapp: resolveIconSvg('brand:whatsapp', context.site.themeName),
      facebook: resolveIconSvg('brand:facebook', context.site.themeName),
      x: resolveIconSvg('brand:x', context.site.themeName),
    },
  }),
};
