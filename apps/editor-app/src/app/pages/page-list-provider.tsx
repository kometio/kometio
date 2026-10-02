import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { PageListContext, type PageListPort } from './page-list-context';
import type { PickedPage } from '@kometio/shared-types';
import { PagePickerDialog } from './page-picker-dialog';

export interface PageListProviderProps {
  siteId: string;
  // Which locale's pages to offer — a NavLink shouldn't be able to point
  // at a page in a different language than the Header/Footer it lives in
  // (docs/adr/0018).
  locale: string;
  children: ReactNode;
}

/**
 * The concrete implementation of @kometio/block-registry's PageListPort — same
 * Promise-based `pick()` pattern as FormListProvider/MediaPickerProvider.
 */
export function PageListProvider({
  siteId,
  locale,
  children,
}: PageListProviderProps) {
  const [open, setOpen] = useState(false);
  const resolveRef = useRef<((value: PickedPage | null) => void) | null>(null);

  const pick = useCallback((): Promise<PickedPage | null> => {
    setOpen(true);
    return new Promise((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  function resolveAndClose(value: PickedPage | null) {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOpen(false);
  }

  const port = useMemo<PageListPort>(() => ({ pick }), [pick]);

  return (
    <PageListContext.Provider value={port}>
      {children}
      <PagePickerDialog
        siteId={siteId}
        locale={locale}
        open={open}
        onOpenChange={(next) => {
          if (!next) resolveAndClose(null);
        }}
        onSelect={(page) =>
          // Deliberately no `locale`/`slug` stored on the picked value:
          // baking those in at pick time was the bug (a link picked while
          // editing one language pointed at THAT language's path even for
          // every OTHER locale of the shared block) — resolved fresh per
          // rendering locale server-side instead
          // (resolve-page-content-references.ts).
          resolveAndClose({
            pageGroupId: page.pageGroupId,
            title: page.title,
          })
        }
      />
    </PageListContext.Provider>
  );
}
