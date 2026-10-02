import { createContext, useContext } from 'react';
import type { PickedPage } from '@kometio/shared-types';

/**
 * Same inversion as FormListContext/MediaPickerContext: the
 * NavLink/Button/Link/Banner/PromoBar/PricingPlan blocks need a way to
 * let the editor pick a page of the site, but this package only defines
 * block descriptors and has no HTTP client or application-level UI. The
 * real dialog (which lists pages from the real API, filtered to the
 * locale of the section being edited) is owned by apps/editor-app and
 * provided through this context.
 */
export interface PageListPort {
  pick(): Promise<PickedPage | null>;
}

export const PageListContext = createContext<PageListPort | null>(null);

export function usePageList(): PageListPort {
  const port = useContext(PageListContext);
  if (!port) {
    throw new Error(
      'usePageList() called outside a PageListContext.Provider — wrap the canvas with the page list provider (apps/editor-app) before rendering blocks with a page link.',
    );
  }
  return port;
}
