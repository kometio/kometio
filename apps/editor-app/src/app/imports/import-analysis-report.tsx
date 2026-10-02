import { useTranslation } from 'react-i18next';
import type { WordPressAnalysis } from '@kometio/shared-types';

/** A number and what it means, which is the whole shape of this screen. */
function Figure({
  value,
  label,
  tone = 'plain',
}: {
  value: number;
  label: string;
  tone?: 'plain' | 'good' | 'warn';
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={
          tone === 'good'
            ? 'text-2xl font-semibold tabular-nums text-success'
            : tone === 'warn'
              ? 'text-2xl font-semibold tabular-nums text-warning'
              : 'text-2xl font-semibold tabular-nums'
        }
      >
        {value}
      </span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

export interface ImportAnalysisReportProps {
  report: WordPressAnalysis;
}

/**
 * What the export would really bring across.
 *
 * Several numbers rather than one, because one would lie: of the two real
 * sites this was built against, one converts 82% of its blocks while
 * leaving 28 178 entries outside, and the other converts 37% with half
 * its pages arriving empty. Either single figure flatters one and
 * slanders the other.
 */
export function ImportAnalysisReport({ report }: ImportAnalysisReportProps) {
  const { t } = useTranslation();
  const { blocks, found, pages } = report;
  // Native and field-backed together: both arrive with their content,
  // and the difference between them is how closely the layout follows.
  const converted = blocks.native + blocks.fromFields;
  const convertible = blocks.total
    ? Math.round((100 * converted) / blocks.total)
    : 0;
  const quarantinedTotal =
    converted > 0 || blocks.dropped > 0
      ? blocks.total - converted - blocks.dropped
      : blocks.total;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{t('imports.report.found')}</h3>
        <div className="flex flex-wrap gap-8">
          <Figure value={found.pages} label={t('imports.report.pages')} />
          <Figure value={found.posts} label={t('imports.report.posts')} />
          <Figure
            value={found.attachments}
            label={t('imports.report.attachments')}
          />
          <Figure
            value={found.menuItems}
            label={t('imports.report.menuItems')}
          />
        </div>
        {found.otherTypes.length > 0 && (
          <p className="text-muted-foreground text-sm">
            {t('imports.report.otherTypes')}{' '}
            {found.otherTypes
              .slice(0, 6)
              .map((entry) => `${entry.type} (${entry.count})`)
              .join(', ')}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">
          {t('imports.report.whatArrives')}
        </h3>
        <div className="flex flex-wrap gap-8">
          <Figure
            value={pages.whole}
            label={t('imports.report.whole')}
            tone="good"
          />
          <Figure
            value={pages.partial}
            label={t('imports.report.partial')}
            tone="warn"
          />
          <Figure
            value={pages.empty}
            label={t('imports.report.empty')}
            tone="warn"
          />
        </div>
        <p className="text-sm">
          {t('imports.report.blocks', {
            native: converted,
            total: blocks.total,
            percent: convertible,
          })}
          {blocks.fromFields > 0 &&
            ` · ${t('imports.report.fromFields', { count: blocks.fromFields })}`}
          {quarantinedTotal > 0 &&
            ` · ${t('imports.report.quarantined', { count: quarantinedTotal })}`}
          {blocks.dropped > 0 &&
            ` · ${t('imports.report.dropped', { count: blocks.dropped })}`}
        </p>
        {blocks.fromFieldsByBlock.length > 0 && (
          <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
            {blocks.fromFieldsByBlock.slice(0, 8).map((entry) => (
              <li key={entry.name} className="flex justify-between gap-4">
                <span className="truncate text-xs">
                  <span className="font-mono">{entry.name}</span>
                  {/* Worth distinguishing: one had its shape described by
                      the site, the other was read from its values alone,
                      which is less certain about what each piece is. */}
                  {entry.knownFrom === 'values' && (
                    <span className="ml-2 italic">
                      {t('imports.report.fromValues')}
                    </span>
                  )}
                </span>
                <span className="tabular-nums">{entry.count}</span>
              </li>
            ))}
          </ul>
        )}
        {blocks.quarantined.length > 0 && (
          <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
            {blocks.quarantined.slice(0, 8).map((entry) => (
              <li key={entry.name} className="flex justify-between gap-4">
                <span className="truncate font-mono text-xs">{entry.name}</span>
                <span className="tabular-nums">{entry.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {report.warnings.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">
            {t('imports.report.warnings')}
          </h3>
          <ul className="flex flex-col gap-2">
            {report.warnings.map((warning) => (
              <li
                key={warning.kind}
                className="border-border rounded-md border border-dashed p-3 text-sm"
              >
                <p>
                  {t(`imports.warnings.${warning.kind}`, {
                    count: warning.count,
                  })}
                </p>
                {warning.detail.length > 0 && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    {warning.detail.join(' · ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
