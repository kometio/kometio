import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { useTranslation } from '../../lib/use-translation';
import { formatShortcut } from '../common/format-shortcut';
import { CANVAS_SHORTCUTS } from './keyboard-shortcuts';

export interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The card behind "Shortcuts" in the canvas rail, and behind the "?" key.
 *
 * Undo, redo, duplicate, copy, paste, delete and move have all worked since
 * Fase 7, and nothing in the product said so — not a tooltip, not a menu,
 * not one of the 1036 translated strings. They are the best part of the
 * editor and they were invisible.
 */
export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: KeyboardShortcutsDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('canvas.shortcuts.title')}</DialogTitle>
          <DialogDescription>
            {t('canvas.shortcuts.description')}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col divide-y">
          {CANVAS_SHORTCUTS.map((shortcut) => (
            <li
              key={shortcut.labelKey}
              className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
            >
              <span className="text-sm">{t(shortcut.labelKey)}</span>
              <kbd className="rounded-md border bg-muted px-2 py-0.5 font-sans text-xs">
                {formatShortcut(shortcut.keys)}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
