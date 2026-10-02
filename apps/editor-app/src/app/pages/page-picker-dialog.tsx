import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { PageSearchList } from './page-search-list';

export interface PagePickerOption {
  pageGroupId: string;
  title: string;
  slug: string;
}

export interface PagePickerDialogProps {
  siteId: string;
  locale: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (page: PagePickerOption) => void;
}

/**
 * Choosing a page to point at — a link's destination, the cookie banner's
 * policy page, a term's landing.
 *
 * The list and its search are PageSearchList's, shared with the parent
 * picker: this dialog used to page through twenty at a time with no way
 * to search, which on a site of any size meant clicking Next until the
 * right page appeared.
 */
export function PagePickerDialog({
  siteId,
  locale,
  open,
  onOpenChange,
  onSelect,
}: PagePickerDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('pages.picker.title')}</DialogTitle>
        </DialogHeader>
        <PageSearchList
          siteId={siteId}
          locale={locale}
          // Radix already unmounts a closed dialog's content, so this is
          // belt and braces rather than the only guard — but it is the
          // one that does not depend on that staying true.
          enabled={open}
          onSelect={(item) =>
            onSelect({
              pageGroupId: item.pageGroupId,
              title: item.title,
              slug: item.slug,
            })
          }
        />
      </DialogContent>
    </Dialog>
  );
}
