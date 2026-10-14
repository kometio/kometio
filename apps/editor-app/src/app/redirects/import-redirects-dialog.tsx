import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { TabPanel, Tabs } from '../../components/ui/tabs';
import type {
  RedirectImportReport,
  WordPressRedirectPlan,
} from '../../lib/redirects-api-client';
import { ImportListPanel } from './import-list-panel';
import { ImportWordPressPanel } from './import-wordpress-panel';

type Source = 'list' | 'wordpress';

export interface ImportRedirectsDialogProps {
  siteId: string;
  /** Offered where the person may read an export (the importer is an administrator's). */
  withWordPress: boolean;
  onOpenChange: (open: boolean) => void;
  /** Judges a list and writes nothing. */
  onCheck: (csv: string) => Promise<RedirectImportReport>;
  /** Does what the check said; the report is what was done. */
  onApply: (csv: string) => Promise<RedirectImportReport>;
  onApplied: (report: RedirectImportReport) => void;
}

/**
 * Where redirects come from in bulk: a list a person has (a spreadsheet, an
 * SEO tool's export), or the addresses of the WordPress site that was
 * moved. Both are judged before they are written and say what they did
 * in the same words; the frame only chooses between them.
 */
export function ImportRedirectsDialog({
  siteId,
  withWordPress,
  onOpenChange,
  onCheck,
  onApply,
  onApplied,
}: ImportRedirectsDialogProps) {
  const { t } = useTranslation();
  const [source, setSource] = useState<Source>('list');

  const close = () => onOpenChange(false);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('redirects.import.title')}</DialogTitle>
          <DialogDescription>
            {source === 'list'
              ? t('redirects.import.description')
              : t('redirects.import.wordpress.summary')}
          </DialogDescription>
        </DialogHeader>

        {withWordPress && (
          <Tabs
            id="redirects-import"
            label={t('redirects.import.sources.label')}
            tabs={[
              { value: 'list', label: t('redirects.import.sources.list') },
              {
                value: 'wordpress',
                label: t('redirects.import.sources.wordpress'),
              },
            ]}
            value={source}
            onChange={setSource}
          />
        )}

        <TabPanel tabsId="redirects-import" value={source}>
          {source === 'list' ? (
            <ImportListPanel
              onCancel={close}
              onCheck={onCheck}
              onApply={onApply}
              onApplied={onApplied}
            />
          ) : (
            <ImportWordPressPanel
              siteId={siteId}
              onCancel={close}
              onApplied={(plan: WordPressRedirectPlan) =>
                onApplied(plan.report)
              }
            />
          )}
        </TabPanel>
      </DialogContent>
    </Dialog>
  );
}
