import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal } from 'lucide-react';
import {
  getLocaleDisplayName,
  PAGE_LIST_STATES,
  type PageListState,
} from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import { DatePicker } from '../../components/ui/date-picker';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { allUsersQueryOptions } from '../users/users-queries';
import { Badge } from '../../components/ui/badge';

/** Everything the "Filters" button hides — search stays out, it is the one people reach for. */
const SECONDARY_FILTER_KEYS = [
  'status',
  'createdAfter',
  'createdBefore',
  'createdBy',
  'locale',
] as const satisfies readonly (keyof PagesListFilterValues)[];

export interface PagesListFilterValues {
  search: string;
  /** '' = any state. */
  status: '' | PageListState;
  /** yyyy-mm-dd, as DatePicker writes it; '' = unset. */
  createdAfter: string;
  createdBefore: string;
  createdBy: string;
  locale: string;
}

export const EMPTY_PAGES_LIST_FILTERS: PagesListFilterValues = {
  search: '',
  status: '',
  createdAfter: '',
  createdBefore: '',
  createdBy: '',
  locale: '',
};

export interface PagesListFilterBarProps {
  value: PagesListFilterValues;
  onChange: (next: PagesListFilterValues) => void;
  enabledLocales: string[];
}

// Radix Select.Item forbids an empty-string value — this sentinel stands
// in for "no filter on this dimension" in the dropdowns below, translated
// back to '' right at the boundary (see the two onValueChange handlers).
const ANY_SENTINEL = '__any__';

/**
 * Fase 4's pages-list filter bar (see the plan). No existing filter-bar
 * pattern anywhere in editor-app to copy (confirmed: neither media-grid,
 * users-list, nor forms-list has one today) — first of its kind. The
 * date range is two calendar pickers (DatePicker), which keep the
 * `YYYY-MM-DD` value the filter compares. Creator/locale are plain
 * Selects, not searchable popovers: both lists are small at this
 * product's "5-15 users/pages" scale.
 */
export function PagesListFilterBar({
  value,
  onChange,
  enabledLocales,
}: PagesListFilterBarProps) {
  const { t, i18n } = useTranslation();
  const { data: usersData } = useQuery(allUsersQueryOptions());

  function set<K extends keyof PagesListFilterValues>(
    key: K,
    next: PagesListFilterValues[K],
  ): void {
    onChange({ ...value, [key]: next });
  }

  const hasActiveFilters = Object.values(value).some((v) => v !== '');
  const activeSecondaryCount = SECONDARY_FILTER_KEYS.filter(
    (key) => value[key] !== '',
  ).length;
  /*
   * The five controls were always on screen, and at 1024px they took two
   * full rows above a list that had not started yet. Four of them go behind
   * a button; search stays out, because it is the one people actually reach
   * for. Open from the start when something is already filtering, so a
   * reloaded address does not hide the reason the list is short.
   */
  const [isOpen, setIsOpen] = useState(activeSecondaryCount > 0);

  return (
    <div className="mb-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="pages-filter-search">
            {t('pages.list.filters.search')}
          </Label>
          {/* Named by the label above it, and drawn as a search: the
              placeholder used to be the only thing that said what the box
              was for, and it went as soon as anything was typed. */}
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="pages-filter-search"
              className="w-56 pl-8"
              value={value.search}
              onChange={(event) => set('search', event.target.value)}
            />
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        >
          <SlidersHorizontal />
          {t('pages.list.filters.toggle')}
          {activeSecondaryCount > 0 && (
            <Badge variant="secondary">{activeSecondaryCount}</Badge>
          )}
        </Button>
        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChange(EMPTY_PAGES_LIST_FILTERS)}
          >
            {t('pages.list.filters.clear')}
          </Button>
        )}
      </div>
      {isOpen && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="pages-filter-status">
              {t('pages.list.filters.status')}
            </Label>
            <Select
              value={value.status || ANY_SENTINEL}
              onValueChange={(next) => {
                const status = PAGE_LIST_STATES.find(
                  (candidate) => candidate === next,
                );
                set('status', status ?? '');
              }}
            >
              <SelectTrigger id="pages-filter-status" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_SENTINEL}>
                  {t('pages.list.filters.anyStatus')}
                </SelectItem>
                {PAGE_LIST_STATES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {t(`pages.list.filters.statusOptions.${status}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pages-filter-created-after">
              {t('pages.list.filters.createdAfter')}
            </Label>
            <DatePicker
              id="pages-filter-created-after"
              className="w-40"
              value={value.createdAfter}
              onChange={(next) => set('createdAfter', next)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pages-filter-created-before">
              {t('pages.list.filters.createdBefore')}
            </Label>
            <DatePicker
              id="pages-filter-created-before"
              className="w-40"
              value={value.createdBefore}
              onChange={(next) => set('createdBefore', next)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pages-filter-created-by">
              {t('pages.list.filters.createdBy')}
            </Label>
            <Select
              value={value.createdBy || ANY_SENTINEL}
              onValueChange={(next) =>
                set('createdBy', next === ANY_SENTINEL ? '' : next)
              }
            >
              <SelectTrigger id="pages-filter-created-by" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_SENTINEL}>
                  {t('pages.list.filters.anyCreator')}
                </SelectItem>
                {usersData?.items.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.displayName || user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pages-filter-locale">
              {t('pages.list.filters.locale')}
            </Label>
            <Select
              value={value.locale || ANY_SENTINEL}
              onValueChange={(next) =>
                set('locale', next === ANY_SENTINEL ? '' : next)
              }
            >
              <SelectTrigger id="pages-filter-locale" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_SENTINEL}>
                  {t('pages.list.filters.anyLocale')}
                </SelectItem>
                {enabledLocales.map((locale) => (
                  <SelectItem key={locale} value={locale}>
                    {getLocaleDisplayName(locale, i18n.language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
