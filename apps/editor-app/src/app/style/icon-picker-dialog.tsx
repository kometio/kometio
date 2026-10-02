import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ImageIcon } from 'lucide-react';
import type { IconEntry } from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { TabPanel, Tabs, type Tab } from '../../components/ui/tabs';
import { TileButton } from '../../components/ui/tile-button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  brandIconSearchQueryOptions,
  themeIconsQueryOptions,
} from './theme-icons-queries';
import { useActiveThemeName } from './use-active-theme-name';
import { useDebouncedValue } from '../common/use-debounced-value';

type IconSource = 'interface' | 'brand' | 'image';

export interface IconPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The value to store — an icon's name, or `brand:name`. */
  onSelect: (value: string) => void;
  /** Leaves this dialog for the media library: an image stands in for a mark no set has (LinkedIn, say). */
  onPickImage: () => void;
}

/**
 * A searchable grid rather than a plain list: the default set (docs/adr/0023)
 * is the whole current Lucide set, around 2000 icons — far too many to
 * scroll without a text filter, unlike `PagePickerDialog` and
 * `MediaPickerDialog`, which paginate a few dozen items.
 *
 * The logos are searched on the server rather than downloaded whole: the
 * brand set serialises to 5.2MB, and the first opening of its tab used to
 * download every one of them to show a few. The third tab is for the marks
 * no set has — an image from the media library, shown as it is.
 */
export function IconPickerDialog({
  open,
  onOpenChange,
  onSelect,
  onPickImage,
}: IconPickerDialogProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<IconSource>('interface');
  const themeName = useActiveThemeName();
  const debouncedSearch = useDebouncedValue(search.trim().toLowerCase());

  // Not gated on `open` (unlike Page/MediaPickerDialog): the active theme
  // never changes at runtime, so the interface set is worth preloading as
  // soon as the provider mounts — it also backs the preview IconPickerField
  // shows for an already-chosen icon. See IconListProvider.
  const { data: interfaceIcons } = useQuery(themeIconsQueryOptions(themeName));
  const { data: brandIcons } = useQuery({
    ...brandIconSearchQueryOptions(themeName, debouncedSearch),
    enabled: open && source === 'brand' && themeName !== '',
  });

  const shown = useMemo<IconEntry[]>(() => {
    if (source === 'brand') return brandIcons ?? [];
    if (!interfaceIcons) return [];
    if (!debouncedSearch) return interfaceIcons;
    return interfaceIcons.filter((icon) => icon.name.includes(debouncedSearch));
  }, [source, brandIcons, interfaceIcons, debouncedSearch]);

  function handleOpenChange(next: boolean) {
    if (!next) setSearch('');
    onOpenChange(next);
  }

  const tabs: Tab<IconSource>[] = [
    { value: 'interface', label: t('icons.picker.sets.interface') },
    { value: 'brand', label: t('icons.picker.sets.brand') },
    { value: 'image', label: t('icons.picker.sets.image') },
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('icons.picker.title')}</DialogTitle>
        </DialogHeader>
        <Tabs
          id="icon-picker"
          label={t('icons.picker.setsLabel')}
          tabs={tabs}
          value={source}
          onChange={setSource}
        />
        <TabPanel
          tabsId="icon-picker"
          value={source}
          className="flex flex-col gap-4"
        >
          {source === 'image' ? (
            <div className="flex flex-col items-start gap-3 py-4">
              <p className="text-sm text-muted-foreground">
                {t('icons.picker.image.hint')}
              </p>
              <Button type="button" variant="outline" onClick={onPickImage}>
                <ImageIcon />
                {t('icons.picker.image.choose')}
              </Button>
            </div>
          ) : (
            <>
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('icons.picker.search')}
                aria-label={t('icons.picker.search')}
              />
              {shown.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t('icons.picker.empty')}
                </p>
              ) : (
                <div className="grid max-h-96 grid-cols-8 gap-1 overflow-y-auto py-2">
                  {shown.map((icon) => (
                    <TileButton
                      key={icon.name}
                      title={icon.name}
                      aria-label={icon.name}
                      onClick={() => onSelect(icon.name)}
                      className="aspect-square text-foreground"
                    >
                      {/* The theme's own SVG: see IconPickerField on why it is
                        drawn as markup, and what keeps it inert. */}
                      <span
                        aria-hidden="true"
                        className="h-5 w-5"
                        dangerouslySetInnerHTML={{ __html: icon.svg }}
                      />
                    </TileButton>
                  ))}
                </div>
              )}
            </>
          )}
        </TabPanel>
      </DialogContent>
    </Dialog>
  );
}
