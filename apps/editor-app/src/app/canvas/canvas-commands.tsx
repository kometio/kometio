import { Eye, Keyboard, Palette, Send } from 'lucide-react';
import type { Block } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import type { BlockPickerCategory } from './block-picker';
import { BlockIcon } from './block-icons';
import type { CanvasPageMenuItem } from './canvas-top-bar';
import type { CommandGroup, CommandItem } from '../common/command-menu';

/** The canvas's four groups, in the order they are listed, under the words given. */
export function canvasCommandGroups(labels: {
  insert: string;
  layers: string;
  page: string;
  editor: string;
}): CommandGroup[] {
  return [
    { id: 'insert', label: labels.insert },
    { id: 'layers', label: labels.layers },
    { id: 'page', label: labels.page },
    { id: 'editor', label: labels.editor },
  ];
}

export interface CommandSources {
  /** Blocks are offered only once the canvas can draw what is inserted. */
  canvasReady: boolean;
  categories: BlockPickerCategory[];
  registry: BlockDescriptor[];
  blocks: Block[];
  pageMenu: CanvasPageMenuItem[] | undefined;
  canInsertType: (type: string) => boolean;
  tLabel: (label: string) => string;
  /** The editor's own entries, already in the editor's language. */
  labels: {
    styles: string;
    shortcuts: string;
    preview: string;
    publish: string;
  };
  /**
   * Who may do what (docs/roles.md): an entry the API would refuse is not
   * offered, here any more than in the bar.
   */
  offers: { styles: boolean; publish: boolean };
}

/**
 * What the search in the top bar lists. Everything in it is also somewhere
 * on screen — the blocks under Add, the layers in Layers, the page's
 * actions in its menu — so it is the quick way there, never the only one.
 */
export function buildCommandItems(sources: CommandSources): CommandItem[] {
  const { registry, categories, tLabel } = sources;
  const items: CommandItem[] = [];

  if (sources.canvasReady) {
    const offered = new Set<string>();
    for (const category of categories) {
      for (const type of category.types) {
        const descriptor = registry.find((d) => d.type === type);
        if (!descriptor || offered.has(type) || !sources.canInsertType(type)) {
          continue;
        }
        offered.add(type);
        items.push({
          id: `insert:${type}`,
          group: 'insert',
          label: tLabel(descriptor.label),
          detail: tLabel(category.title),
          keywords: type,
          icon: <BlockIcon name={descriptor.icon} />,
        });
      }
    }
  }

  const addLayers = (list: Block[], trail: string[]): void => {
    for (const block of list) {
      if (!block.id) continue;
      const descriptor = registry.find((d) => d.type === block.type);
      const label = descriptor ? tLabel(descriptor.label) : block.type;
      items.push({
        id: `layer:${block.id}`,
        group: 'layers',
        label,
        detail: trail.length > 0 ? trail.join(' › ') : undefined,
        keywords: trail.join(' '),
        icon: descriptor ? <BlockIcon name={descriptor.icon} /> : undefined,
      });
      if (block.children) addLayers(block.children, [...trail, label]);
    }
  };
  addLayers(sources.blocks, []);

  (sources.pageMenu ?? []).forEach(({ label, icon: Icon }, index) => {
    items.push({
      id: `page:${index}`,
      group: 'page',
      label,
      icon: <Icon />,
    });
  });

  if (sources.offers.styles) {
    items.push({
      id: 'editor:styles',
      group: 'editor',
      label: sources.labels.styles,
      icon: <Palette />,
    });
  }
  items.push(
    {
      id: 'editor:shortcuts',
      group: 'editor',
      label: sources.labels.shortcuts,
      icon: <Keyboard />,
    },
    {
      id: 'editor:preview',
      group: 'editor',
      label: sources.labels.preview,
      icon: <Eye />,
    },
  );
  if (sources.offers.publish) {
    items.push({
      id: 'editor:publish',
      group: 'editor',
      label: sources.labels.publish,
      icon: <Send />,
    });
  }
  return items;
}

export interface CommandActions {
  registry: BlockDescriptor[];
  pageMenu: CanvasPageMenuItem[] | undefined;
  insert: (descriptor: BlockDescriptor) => void;
  selectLayer: (blockId: string) => void;
  openStyles: () => void;
  openShortcuts: () => void;
  openPreview: () => void;
  publish: () => void;
}

/**
 * What choosing an entry does, by the id it was built with
 * (`insert:<type>`, `layer:<blockId>`, `page:<index>`, `editor:<name>`).
 * One function for all of them rather than a callback on each entry: the
 * list is built during render, and a callback per entry that reaches the
 * editor's refs is what the React Compiler refuses to let render hold.
 */
export function runCommand(item: CommandItem, actions: CommandActions): void {
  const separator = item.id.indexOf(':');
  const kind = item.id.slice(0, separator);
  const key = item.id.slice(separator + 1);
  if (kind === 'insert') {
    const descriptor = actions.registry.find((d) => d.type === key);
    if (descriptor) actions.insert(descriptor);
  } else if (kind === 'layer') {
    actions.selectLayer(key);
  } else if (kind === 'page') {
    const entry = actions.pageMenu?.[Number(key)];
    if (entry?.onSelect) entry.onSelect();
    else if (entry?.href) {
      window.open(entry.href, '_blank', 'noopener,noreferrer');
    }
  } else if (key === 'styles') {
    actions.openStyles();
  } else if (key === 'shortcuts') {
    actions.openShortcuts();
  } else if (key === 'preview') {
    actions.openPreview();
  } else if (key === 'publish') {
    actions.publish();
  }
}
