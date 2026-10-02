import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from 'react';
import { Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../components/ui/dialog';
import { cn } from '../../lib/utils';
import { useTranslation } from '../../lib/use-translation';

/** A heading the entries are listed under, and its place: what people come for most, first. */
export interface CommandGroup {
  id: string;
  label: string;
}

export interface CommandItem {
  /** Unique across the whole list. */
  id: string;
  /** The `id` of one of the menu's groups; an entry in none of them is not listed. */
  group: string;
  label: string;
  /** Searched too, never shown on its own: a block's type, a layer's parent. */
  keywords?: string;
  /** Dimmer text after the label — a layer's depth, say. */
  detail?: string;
  icon?: ReactNode;
}

export interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the field is for, in words: its name, and the line inside it before anything is typed. */
  title: string;
  placeholder: string;
  /** The groups, in the order they are listed, with their headings. */
  groups: readonly CommandGroup[];
  items: CommandItem[];
  /**
   * What choosing an entry does. One handler for all of them, keyed by the
   * entry's id, rather than a callback on each: the list is built during
   * render, and a callback per entry that reaches the editor's refs is
   * exactly what the React Compiler refuses to let render hold.
   */
  onRun: (item: CommandItem) => void;
  /**
   * Told what is typed, for a menu whose entries come from the server: it
   * searches while the words are still arriving. The entries it is given
   * are still filtered here, so a source that answers with more than was
   * asked for costs nothing.
   */
  onQueryChange?: (query: string) => void;
  /** Whether an answer is still on its way: the list says so, so an empty one is not read as "nothing". */
  loading?: boolean;
}

/** Case and accents ignored: "titolo" finds "Títolo", "hero" finds "Hero". */
function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function filterCommands(
  items: readonly CommandItem[],
  query: string,
  groups: readonly CommandGroup[],
): CommandItem[] {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  const matching =
    words.length === 0
      ? items
      : items.filter((item) => {
          const haystack = normalise(`${item.label} ${item.keywords ?? ''}`);
          return words.every((word) => haystack.includes(word));
        });
  // Stable within a group, groups in their fixed order: the list does not
  // reshuffle under the pointer as a word is typed.
  return groups.flatMap((group) =>
    matching.filter((item) => item.group === group.id),
  );
}

/**
 * A search that finds a thing and does it, opened from a box or a key: the
 * canvas's (blocks to add, layers, the page's actions) and the shell's
 * (pages, files, settings, actions) are this one component with different
 * entries.
 *
 * Every entry also exists somewhere you can see. This is the fast way to
 * any of them, never the only way to one of them.
 *
 * A listbox driven from the input (`aria-activedescendant`), so focus never
 * leaves the field: typing and choosing are one gesture.
 */
export function CommandMenu({
  open,
  onOpenChange,
  title,
  placeholder,
  groups,
  items,
  onRun,
  onQueryChange,
  loading = false,
}: CommandMenuProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const hintId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const results = filterCommands(items, query, groups);
  const groupLabels = new Map(groups.map((group) => [group.id, group.label]));
  const active = results[Math.min(activeIndex, results.length - 1)];

  function changeQuery(next: string): void {
    setQuery(next);
    setActiveIndex(0);
    onQueryChange?.(next);
  }

  function close(): void {
    onOpenChange(false);
    changeQuery('');
  }

  function run(item: CommandItem): void {
    close();
    onRun(item);
  }

  function moveTo(index: number): void {
    setActiveIndex(index);
    listRef.current
      ?.querySelector(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (results.length === 0) return;
    const current = Math.min(activeIndex, results.length - 1);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveTo((current + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveTo((current - 1 + results.length) % results.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      moveTo(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      moveTo(results.length - 1);
    } else if (event.key === 'Enter' && active) {
      event.preventDefault();
      run(active);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
    >
      <DialogContent
        showCloseButton={false}
        className="top-24 translate-y-0 gap-0 p-0 sm:max-w-lg"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription id={hintId} className="sr-only">
          {t('commandMenu.hint')}
        </DialogDescription>
        <div className="flex items-center gap-2 border-b px-3 [&_svg]:size-4 [&_svg]:text-muted-foreground">
          <Search />
          <input
            // The field IS the dialog: nothing else in it takes focus.
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={
              active ? `${listId}-${active.id}` : undefined
            }
            aria-describedby={hintId}
            aria-label={title}
            placeholder={placeholder}
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={title}
          className="max-h-80 overflow-y-auto p-1.5"
        >
          {results.length === 0 && !loading && (
            <li className="px-2 py-6 text-center text-sm text-muted-foreground">
              {t('commandMenu.empty', { query })}
            </li>
          )}
          {results.map((item, index) => {
            // The first result has no predecessor, so it always starts one.
            const startsGroup = results[index - 1]?.group !== item.group;
            const isActive = item === active;
            return (
              <li key={item.id} role="presentation">
                {startsGroup && (
                  <div
                    role="presentation"
                    className="px-2 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                  >
                    {groupLabels.get(item.group)}
                  </div>
                )}
                <div
                  id={`${listId}-${item.id}`}
                  role="option"
                  aria-selected={isActive}
                  data-index={index}
                  onPointerMove={() => {
                    if (!isActive) setActiveIndex(index);
                  }}
                  onClick={() => run(item)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
                    isActive && 'bg-muted',
                  )}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                  {item.detail && (
                    <span className="ml-auto truncate text-xs text-muted-foreground">
                      {item.detail}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {/* Outside the listbox: it is not an option, and a listbox holds
            only those. A live region, so "searching" is heard. */}
        {loading && (
          <p
            role="status"
            className="border-t px-3 py-2 text-sm text-muted-foreground"
          >
            {t('commandMenu.searching')}
          </p>
        )}
        <div
          aria-hidden="true"
          className="border-t px-3 py-2 text-xs text-muted-foreground"
        >
          {t('commandMenu.hint')}
        </div>
      </DialogContent>
    </Dialog>
  );
}
