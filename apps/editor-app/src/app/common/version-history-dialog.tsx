import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { TabPanel, Tabs } from '../../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { SkeletonRows } from '../../components/ui/skeleton';
import { useFormatDate } from '../../lib/use-format-date';

// The minimal shape every version record shares — a page group's, a page
// translation's, a layout section's. This dialog is presentational only
// (docs/adr/0018): it doesn't know or care which entity's versions it is
// showing, that's the caller's own hook (usePageVersions /
// useSiteLayoutSectionVersions) to fetch and pass in.
export interface VersionSummary {
  id: string;
  createdAt: string;
  /** Said beside the date — what restoring this version would do beyond the obvious, e.g. unlink a language again. */
  note?: string;
}

/**
 * One history the dialog can show. A page has two: its shared structure,
 * and the text of the language being edited — which is where an unlinked
 * language keeps its own tree, and where a relinked one keeps the fork it
 * let go of (docs/adr/0075).
 */
export interface VersionSource {
  key: string;
  /** Shown only when there is more than one source to choose between. */
  label: string;
  versions: VersionSummary[];
  isLoading: boolean;
  onRollback: (versionId: string) => Promise<unknown>;
}

export interface VersionHistoryDialogProps {
  sources: VersionSource[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VersionHistoryDialog({
  sources,
  open,
  onOpenChange,
}: VersionHistoryDialogProps) {
  const { t } = useTranslation();
  const formatDateTime = useFormatDate('dateTime');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Falls back to the first one when the selection is gone — switching to
  // an unlinked language takes the structure's history away.
  const source =
    sources.find((candidate) => candidate.key === selectedKey) ?? sources[0];

  async function handleRollback(versionId: string) {
    if (!source) return;
    await source.onRollback(versionId);
    onOpenChange(false);
  }

  // Newest first; the API returns them oldest-first (see listByPage).
  const sorted = [...(source?.versions ?? [])].reverse();

  const list =
    !source || source.isLoading ? (
      <SkeletonRows />
    ) : sorted.length === 0 ? (
      <p className="text-sm text-muted-foreground">
        {t('pages.versionHistory.empty')}
      </p>
    ) : (
      <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
        {sorted.map((version, index) => (
          <li
            key={version.id}
            className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm"
          >
            <span className="flex min-w-0 flex-col">
              <span>{formatDateTime(version.createdAt)}</span>
              {version.note && (
                <span className="text-xs text-muted-foreground">
                  {version.note}
                </span>
              )}
            </span>
            {index === 0 ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                {t('pages.versionHistory.current')}
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => void handleRollback(version.id)}
              >
                {t('pages.versionHistory.restore')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('pages.versionHistory.title')}</DialogTitle>
          <DialogDescription>
            {t('pages.versionHistory.description')}
          </DialogDescription>
        </DialogHeader>
        {source && sources.length > 1 && (
          <Tabs
            id="version-history"
            label={t('pages.versionHistory.sourcesLabel')}
            tabs={sources.map((candidate) => ({
              value: candidate.key,
              label: candidate.label,
            }))}
            value={source.key}
            onChange={setSelectedKey}
          />
        )}
        {source && sources.length > 1 ? (
          <TabPanel tabsId="version-history" value={source.key}>
            {list}
          </TabPanel>
        ) : (
          list
        )}
      </DialogContent>
    </Dialog>
  );
}
