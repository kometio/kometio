import type { MutableRefObject, ReactNode } from 'react';
import type { Block, ExposedFields } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import type { BlockPickerCategory } from './block-picker';
import type { EditingSection } from './canvas-frame';
import type { CanvasPageMenuItem, CanvasTopBarProps } from './canvas-top-bar';
import type { PageGenerationConfig } from './use-page-generation-entry';

export interface CanvasEditorShellProps {
  backLink: ReactNode;
  /** Dropdown for switching to another page without leaving the editor (top bar, next to `backLink`) — only the page editor passes it; the Header/Footer editor does not (it has no notion of "other pages to choose between"). */
  pageSwitcher?: ReactNode;
  /** Field-level i18n (see the plan) — dropdown for switching to another language of the SAME PageGroup without leaving the editor, next to `pageSwitcher`. Only PageGroupEditorView passes it. */
  languageSwitcher?: ReactNode;
  /**
   * Field-level i18n — present only while editing a LINKED (not diverged)
   * PageTranslation of a PageGroup: it decides whether a changed
   * `translatable` field is written to the active translation's
   * `fieldValues` overlay instead of to the shared structure. Absent for
   * the old Page editor, for the Header/Footer editor, and for an already
   * unlinked translation (which behaves like the old model: always
   * `onChange`, never a separate overlay).
   */
  translationRouting?: {
    activeLocale: string;
    defaultLocale: string;
    onSaveFieldValue: (blockId: string, field: string, value: string) => void;
  };
  /** When present, and the person may configure the site, the rail offers the Style page — both editors (page, header/footer) have a site to apply styles to. */
  siteId?: string;
  /** What is being edited, in words — the middle of the top bar used to be empty. */
  title?: string;
  /** Page editor only: whether visitors can see the page at all, shown as a badge beside its name. */
  publicationState?: 'draft' | 'published';
  /** Page editor only: a publication waiting for its moment, drawn on the bar in place of "Draft" (docs/adr/0135). */
  scheduled?: CanvasTopBarProps['scheduled'];
  /** Page-level actions, drawn as a labelled menu rather than a row of unlabelled icons. */
  pageMenu?: CanvasPageMenuItem[];
  statusText: string;
  /**
   * Whether a write this editor's own hook owns is on the wire. It joins
   * the canvas's debounce window to decide when leaving the BROWSER is
   * worth interrupting somebody over (see useUnsavedChangesGuard) — the
   * shell can see the debounce, only the caller can see the request.
   */
  isSaving?: boolean;
  actions?: ReactNode;
  /** Shown in the Properties panel while no block is selected — the header's own settings, next to the blocks'. See NoSelectionPanel. */
  noSelectionExtra?: ReactNode;
  registry: BlockDescriptor[];
  categories: BlockPickerCategory[];
  blocks: Block[];
  /** Called with the updated tree on every change (property, text, insert, reorder, removal) — the caller owns the real draft save. */
  onChange: (blocks: Block[]) => void;
  /**
   * Resolves when every draft save the caller has queued has landed.
   *
   * The canvas asks before it reads the draft back — reloading the iframe,
   * or rendering a block whose content lives on the server (a reusable
   * section). Without it the iframe could fetch the draft from before the
   * change that caused the reload.
   */
  whenSaved?: () => Promise<void>;
  onPublish: (blocks: Block[]) => unknown;
  /**
   * Always the id of ONE PageTranslation (field-level i18n), even while
   * editing the header/footer (see canvas-frame.tsx) — the caller picks
   * which translation to use as context when `editingSection` is present
   * (site-layout-section-editor-view.tsx uses the "representative"
   * translation from use-representative-page.ts).
   */
  pageId: string;
  editingSection?: EditingSection;
  /** Present only in the reusable-section editor — see CanvasFrame's own prop. */
  sectionPreview?: { sectionId: string; locale: string };
  /**
   * Also section-editor only (docs/adr/0059): it puts an "a page may
   * change this" checkbox beside every field, which is how the agency
   * decides what a client may touch on an instance.
   */
  sectionEditing?: {
    exposedFields: ExposedFields;
    onToggleField: (blockId: string, field: string) => void;
  };
  /** Bumped only on an explicit rollback: it is part of the canvas's `key`, so the editor is mounted again over the restored content. */
  restoredAt?: number;
  /**
   * Filled with the shell's own flush: it sends at once any change still
   * waiting out the debounce. For the actions a view draws outside the
   * shell (its history dialog) that must not be overtaken by one — a
   * restore waits for the saves already queued, and a change still in
   * the debounce is not queued yet: it would land after the restore and
   * undo it. The page menu's items are flushed by the shell itself.
   */
  flushRef?: MutableRefObject<(() => void) | null>;
  /** Page editor only: "Generate with AI", written by the site's own provider. */
  pageGeneration?: PageGenerationConfig;
  children?: ReactNode;
}
