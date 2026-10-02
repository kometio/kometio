import * as React from 'react';
import {
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/utils';

export interface Tab<T extends string> {
  value: T;
  label: ReactNode;
}

export interface TabsProps<T extends string> {
  /**
   * Names the tabs and their panels — `${id}-tab-${value}` and
   * `${id}-panel-${value}` — so each points at the other. A `TabPanel`
   * with the same `id` is the panel.
   */
  id: string;
  /** What the strip switches between, for a screen reader. */
  label: string;
  tabs: readonly Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * `segmented`: a strip in a panel or a dialog — Layers and Properties,
   * an icon picker's sets. `underline`: the sections of a whole page — a
   * form's questions and its answers.
   */
  variant?: 'segmented' | 'underline';
  className?: string;
}

const listClass = {
  segmented: 'flex shrink-0 items-center gap-0.5 rounded-md bg-muted p-0.5',
  underline: 'flex gap-1 border-b border-border',
};

const tabClass = {
  segmented:
    'flex-1 rounded-md px-2 py-1 text-xs font-medium text-foreground/70 hover:text-foreground aria-selected:bg-background aria-selected:text-foreground',
  underline:
    '-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground aria-selected:border-primary aria-selected:font-medium aria-selected:text-foreground',
};

/**
 * A tab strip a keyboard can drive: a roving tabindex, so Tab steps into
 * the strip and then into its panel, and the arrows (Home and End too)
 * move between the tabs, the panel following. Three strips drew this by
 * hand in three looks, and only one of them answered the arrows.
 */
export function Tabs<T extends string>({
  id,
  label,
  tabs,
  value,
  onChange,
  variant = 'segmented',
  className,
}: TabsProps<T>) {
  const stripRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    const current = tabs.findIndex((tab) => tab.value === value);
    const last = tabs.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? current === last
          ? 0
          : current + 1
        : event.key === 'ArrowLeft'
          ? current === 0
            ? last
            : current - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    const target = next === null ? undefined : tabs[next];
    if (target === undefined) return;
    event.preventDefault();
    onChange(target.value);
    // Follow-focus: the keyboard has to end up on the tab it moved to, or
    // the next arrow starts over from wherever it was.
    stripRef.current
      ?.querySelector<HTMLButtonElement>(`#${tabId(id, target.value)}`)
      ?.focus();
  }

  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      onKeyDown={handleKeyDown}
      className={cn(listClass[variant], className)}
    >
      {tabs.map((tab) => {
        const isSelected = tab.value === value;
        return (
          <button
            key={tab.value}
            id={tabId(id, tab.value)}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls={panelId(id, tab.value)}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            className={cn(
              'outline-none focus-visible:ring-2 focus-visible:ring-ring',
              tabClass[variant],
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps extends React.ComponentProps<'div'> {
  /** The `id` of its `Tabs`. */
  tabsId: string;
  /** The tab it belongs to. */
  value: string;
}

/** The panel under a `Tabs`, named by the tab that shows it. */
export function TabPanel({ tabsId, value, ...props }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={panelId(tabsId, value)}
      aria-labelledby={tabId(tabsId, value)}
      {...props}
    />
  );
}

function tabId(id: string, value: string): string {
  return `${id}-tab-${value}`;
}

function panelId(id: string, value: string): string {
  return `${id}-panel-${value}`;
}
