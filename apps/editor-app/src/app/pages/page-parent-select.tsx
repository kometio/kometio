import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ChevronsUpDown } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../components/ui/popover';
import { pageGroupTranslationsQueryOptions } from './page-groups-queries';
import { PageSearchList } from './page-search-list';
import { ListItemButton } from '../../components/ui/list-item-button';

export interface PageParentSelectProps {
  id: string;
  siteId: string;
  /** Which language's titles are listed — the addresses differ per language, the tree does not. */
  locale: string;
  /** `null` for a page that hangs at the top level. */
  value: string | null;
  onChange: (parentId: string | null) => void;
  /**
   * Never offered as a destination: the page being moved, and everything
   * under it. A ring in the tree is refused by the API anyway — this is so
   * nobody is invited to ask for one. Resolved by the server, which is the
   * only side that can: a searched-for page arrives without its ancestors.
   */
  excludeSubtreeOf?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Which page a page hangs from — asked when one is created, and again
 * when one moves (docs/adr/0074).
 *
 * A searchable list rather than a plain select, since ADR-0074's
 * assumption that a site is "5-15 pages" stopped being one: the select
 * loaded a single page of twenty and a site with more simply could not
 * name its own pages as parents. The search is the server's, and the
 * chosen page is read on its own rather than found in the list — it is
 * the one page that must be nameable whether or not it is on screen.
 */
export function PageParentSelect({
  id,
  siteId,
  locale,
  value,
  onChange,
  excludeSubtreeOf,
  disabled,
  className,
}: PageParentSelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  // The current parent by id, not by looking for it in the list: a
  // filtered or paginated list is not guaranteed to hold it, and a
  // trigger that reads "at the top level" for a page that has a parent
  // is worse than one that is briefly blank.
  const { data: parentTranslations } = useQuery({
    ...pageGroupTranslationsQueryOptions(value ?? ''),
    enabled: value !== null,
  });
  const parent = parentTranslations
    ? (parentTranslations.find(
        (translation) => translation.locale === locale,
      ) ?? parentTranslations[0])
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          id={id}
          variant="outline"
          disabled={disabled}
          // A disclosure, not a combobox: the panel it opens holds a
          // search field and a list of buttons, and claiming the
          // combobox role would promise a listbox of options that is not
          // there.
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn('justify-between font-normal', className)}
        >
          <span className="truncate">
            {value === null
              ? t('pages.parent.none')
              : parent?.seoMeta.title || parent?.slug || '…'}
          </span>
          <ChevronsUpDown className="opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={t('pages.parent.label')}
        // Never taller than the room Radix found for it. Without this the
        // panel opens upwards when the dialog sits low on the screen and
        // its own search field goes off the top of the window — seen, on
        // a short viewport, before this line existed.
        className="flex max-h-(--radix-popover-content-available-height) w-(--radix-popover-trigger-width) min-w-72 flex-col p-3"
      >
        <PageSearchList
          siteId={siteId}
          locale={locale}
          enabled={open}
          excludeSubtreeOf={excludeSubtreeOf}
          selectedId={value}
          onSelect={(item) => {
            onChange(item.pageGroupId);
            setOpen(false);
          }}
          header={
            // Inside the list rather than above the search box: "at the
            // top level" is one of the answers, and an answer that sits
            // outside the list of answers gets missed.
            <li>
              <ListItemButton
                inset="row"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                aria-current={value === null ? 'true' : undefined}
              >
                {t('pages.parent.none')}
              </ListItemButton>
            </li>
          }
        />
      </PopoverContent>
    </Popover>
  );
}
