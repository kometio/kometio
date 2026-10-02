import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { useApplySavedInterfaceLanguage } from '../account/use-interface-language';
import { IconButton } from '../common/icon-button';
import { KometioMark } from './kometio-mark';
import { GlobalSearch } from './global-search';
import { SidebarContent } from './sidebar-content';
import { SidebarRail } from './sidebar-rail';
import { useScreenTitle } from './screen-title';
import { useGlobalSearchShortcut } from './use-global-search-shortcut';
import { useSidebarCollapsed } from './use-sidebar-collapsed';

export interface AdminShellProps {
  children: ReactNode;
}

export function AdminShell({ children }: AdminShellProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { isCollapsed, setCollapsed } = useSidebarCollapsed();
  const screenTitle = useScreenTitle();
  useGlobalSearchShortcut(() => setIsSearchOpen(true));
  useApplySavedInterfaceLanguage();

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      {/*
        The wordmark used to have a 37px bar of its own across the whole
        window, holding the single word "Kometio" at 14px — thirty-seven
        pixels of every screen spent on it, and the canvas editor already
        did without it. It sits at the top of the sidebar instead, where a
        product's name goes, and the "K" wears the accent so the app has a
        mark rather than a word.

        From `md` up only. Below that the sidebar was a fixed 208px column
        that took more than half of a 390px phone on every screen of the
        editor, leaving the page itself a strip. There it becomes a bar with
        the mark and a button, and the same navigation slides in on demand.

        Folded, it is the 72px strip the canvas has down its own left edge —
        the same width and the same look — and the change is a click, with
        no animation: the width does not move a pixel of layout on the way.
      */}
      <nav
        aria-label={t('shell.sidebar.label')}
        className={
          isCollapsed
            ? 'hidden w-18 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-sidebar-border bg-sidebar px-0.5 py-3 text-sidebar-foreground md:flex'
            : 'hidden w-52 shrink-0 flex-col gap-4 overflow-y-auto border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground md:flex'
        }
      >
        {isCollapsed ? (
          <SidebarRail
            onSearch={() => setIsSearchOpen(true)}
            onExpand={() => setCollapsed(false)}
          />
        ) : (
          <SidebarContent
            onSearch={() => setIsSearchOpen(true)}
            onCollapse={() => setCollapsed(true)}
          />
        )}
      </nav>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-2 text-sidebar-foreground md:hidden">
        <KometioMark />
        {/* Where you are: with the sidebar folded away there is no
            highlighted entry to say it. The screen's own heading says it
            to a screen reader, so this does not say it twice. */}
        <span
          aria-hidden
          className="min-w-0 flex-1 truncate text-sm text-muted-foreground"
        >
          {screenTitle}
        </span>
        {/* Written, not an icon: the search is how you find anything from
            a phone, and it has the room. */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsSearchOpen(true)}
        >
          <Search />
          {t('shell.search.short')}
        </Button>
        <IconButton
          label={t('shell.menu.open')}
          onClick={() => setMenuOpen(true)}
        >
          <Menu />
        </IconButton>
      </header>
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        {/* A dialog, so focus is trapped in it, Escape and a tap outside
            close it, and the page behind is inert — everything a menu that
            covers the screen owes a keyboard and a screen reader. Anchored
            to the start edge instead of the centre. */}
        <DialogContent
          className="top-0 left-0 flex h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 flex-col gap-4 overflow-y-auto rounded-none border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground sm:max-w-72"
          // Following a link closes the menu: the screen it opens is the
          // thing the reader wanted to see, not the menu over it.
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest('a')) {
              setMenuOpen(false);
            }
          }}
        >
          <DialogTitle className="sr-only">{t('shell.menu.title')}</DialogTitle>
          <SidebarContent
            onSearch={() => {
              // One dialog at a time: the menu goes, the search comes.
              setMenuOpen(false);
              setIsSearchOpen(true);
            }}
          />
        </DialogContent>
      </Dialog>
      <GlobalSearch open={isSearchOpen} onOpenChange={setIsSearchOpen} />
      <main className="min-w-0 flex-1 overflow-auto p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
