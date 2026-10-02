import { type ReactNode, useState } from 'react';
import { ChevronDown, Redo2, Undo2, type LucideIcon } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../components/ui/popover';
import { useTranslation } from '../../lib/use-translation';
import { IconButton } from '../common/icon-button';
import { BreakpointSelector, type Breakpoint } from './breakpoint-selector';
import { formatShortcut } from '../common/format-shortcut';
import { SearchTrigger } from '../common/search-trigger';

/**
 * One entry of the "Page" menu.
 *
 * These used to be six unlabelled icons crowded at the left of the bar —
 * search, classification, history, translations, fork, open page — sitting
 * beside undo and redo with nothing to say that four of them act on the
 * PAGE and two on the CANVAS. A tooltip each is not a hierarchy.
 */
export interface CanvasPageMenuItem {
  /** Stable across renders, and what the reader actually sees. */
  label: string;
  icon: LucideIcon;
  onSelect?: () => void;
  /** For "open the page", which must stay a real link: middle-click, copy address, open in a new tab. */
  href?: string;
}

export interface CanvasTopBarProps {
  backLink: ReactNode;
  pageSwitcher?: ReactNode;
  languageSwitcher?: ReactNode;
  /** What is being edited, in words — the centre of the bar used to hold nothing at all, not even the name of the page. */
  title?: string;
  /** Whether visitors can see this page at all — absent for things that are not pages (the header, a section). */
  publicationState?: 'draft' | 'published';
  statusText: string;
  /** Page-level actions, as a labelled menu rather than a row of icons. */
  pageMenu?: CanvasPageMenuItem[];
  /** Anything that genuinely has to stay on the bar — the header editor's "stick while scrolling" is the only one. */
  actions?: ReactNode;
  /** "Generate with AI", beside undo: what it adds, undo takes back. */
  generateAction?: ReactNode;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  breakpoint: Breakpoint;
  onBreakpointChange: (breakpoint: Breakpoint) => void;
  /** The search box in the middle of the bar — it is a button that opens the command menu. */
  onOpenCommandMenu: () => void;
  onOpenPreview: () => void;
  /**
   * Absent for somebody whose role cannot publish (docs/roles.md): the bar
   * then says who does, rather than offering a button the API refuses.
   */
  onPublish?: () => void;
}

function PageMenu({ items }: { items: CanvasPageMenuItem[] }) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1">
          {t('canvas.pageMenu.label')}
          <ChevronDown className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-60"
        aria-label={t('canvas.pageMenu.label')}
      >
        {items.map(({ label, icon: Icon, onSelect, href }) =>
          href ? (
            <Button
              key={label}
              asChild
              variant="ghost"
              className="w-full justify-start gap-2 px-1 py-1.5 text-sm"
            >
              <a href={href} target="_blank" rel="noopener noreferrer">
                <Icon className="size-4" />
                {label}
              </a>
            </Button>
          ) : (
            <Button
              key={label}
              variant="ghost"
              className="w-full justify-start gap-2 px-1 py-1.5 text-sm"
              onClick={() => {
                setIsOpen(false);
                onSelect?.();
              }}
            >
              <Icon className="size-4" />
              {label}
            </Button>
          ),
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The strip above the canvas: what you are editing and what state it is in
 * on the left, the one search box in the middle, and what you can do to the
 * canvas plus the two ways out on the right.
 *
 * The page's state is written, always: a badge says whether the page is a
 * draft or published, and the line beside it says whether what you last
 * typed has been saved. That line used to be the only signal, and it is
 * empty until the first change (see useSaveStatusText), so a page you had
 * just opened said nothing at all about itself.
 */
export function CanvasTopBar({
  backLink,
  pageSwitcher,
  languageSwitcher,
  title,
  publicationState,
  statusText,
  pageMenu,
  actions,
  generateAction,
  undo,
  redo,
  canUndo,
  canRedo,
  breakpoint,
  onBreakpointChange,
  onOpenCommandMenu,
  onOpenPreview,
  onPublish,
}: CanvasTopBarProps) {
  const { t } = useTranslation();
  const commandShortcut = formatShortcut(['mod', 'K']);

  return (
    /* On a phone the three groups cannot fit on one row, so the bar
       becomes two: where you are, then what you can do. The editor's
       banner: axe found every control of the bar outside any landmark. */
    <header
      aria-label={t('canvas.landmarks.bar')}
      className="grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b px-3 text-xs text-muted-foreground max-sm:flex max-sm:h-auto max-sm:flex-wrap max-sm:gap-y-1.5 max-sm:py-1.5"
    >
      <div className="flex min-w-0 items-center gap-2">
        {/* Never wrapped: on a phone "← Pages" stacked its arrow on top of
            its word, the tallest thing on a two-line bar. */}
        <span className="shrink-0 whitespace-nowrap">{backLink}</span>
        {pageSwitcher}
        {title && (
          // The page's one heading: what is being edited.
          <h1 className="m-0 truncate text-sm font-semibold text-foreground">
            {title}
          </h1>
        )}
        {languageSwitcher}
        {pageMenu && pageMenu.length > 0 && <PageMenu items={pageMenu} />}
        {actions}
        {publicationState && (
          <Badge
            variant={publicationState === 'published' ? 'success' : 'secondary'}
          >
            {t(`canvas.publication.${publicationState}`)}
          </Badge>
        )}
        {/* A live region: "Saving…" then "Draft saved at 14:32" is news
            to somebody who cannot see the bar change. */}
        <span role="status" className="truncate tabular-nums">
          {statusText}
        </span>
      </div>
      {/* A button that looks like the field it opens, so the search is
          visible to people who will never press its shortcut. */}
      <SearchTrigger
        onClick={onOpenCommandMenu}
        label={t('canvas.command.open')}
        shortLabel={t('canvas.command.short')}
        shortcut={commandShortcut}
        className="w-80 max-lg:w-auto max-sm:order-last"
      />
      <div className="flex items-center justify-end gap-1 max-sm:ml-auto">
        {generateAction}
        <IconButton
          label={t('canvas.undo')}
          shortcut={formatShortcut(['mod', 'Z'])}
          onClick={undo}
          disabled={!canUndo}
        >
          <Undo2 />
        </IconButton>
        <IconButton
          label={t('canvas.redo')}
          shortcut={formatShortcut(['mod', '⇧', 'Z'])}
          onClick={redo}
          disabled={!canRedo}
        >
          <Redo2 />
        </IconButton>
        {/* Not on a phone: the window is already a phone's width, so
            there is nothing narrower to preview, and the bar had no room
            left for Publish. */}
        <div className="contents max-sm:hidden">
          <BreakpointSelector
            value={breakpoint}
            onChange={onBreakpointChange}
          />
        </div>
        <Button variant="outline" onClick={onOpenPreview}>
          {t('canvas.preview')}
        </Button>
        {onPublish ? (
          <Button onClick={onPublish}>{t('canvas.publish')}</Button>
        ) : (
          <span className="px-1 text-xs text-muted-foreground max-sm:hidden">
            {t('canvas.publishedByPublisher')}
          </span>
        )}
      </div>
    </header>
  );
}
