import { useQuery } from '@tanstack/react-query';
import { copySectionBlocks, type Block } from '@kometio/shared-types';
import { useTranslation } from '../../lib/use-translation';
import {
  publishedTemplatesQueryOptions,
  unpublishedTemplateCountQueryOptions,
} from '../sections/reusable-sections-queries';
import { ListItemButton } from '../../components/ui/list-item-button';

export interface TemplatePickerProps {
  siteId: string;
  onInsert: (blocks: (Block & { id: string })[]) => void;
  /** Listed but not taken yet — while the canvas loads its page. */
  disabled?: boolean;
}

/**
 * The templates, beside the blocks (docs/adr/0059).
 *
 * A template is a COPY taken once: what lands on the page is its blocks,
 * with brand-new ids, and nothing afterwards links them back. That is the
 * whole difference from a shared section, and it is why templates are a
 * second list here rather than a checkbox on the section picker — the
 * person inserting one is choosing between two different promises, and
 * the menu has to say which.
 *
 * The PUBLISHED content, never the draft: what a template hands out is
 * what its author signed off on.
 */
export function TemplatePicker({
  siteId,
  onInsert,
  disabled,
}: TemplatePickerProps) {
  const { t } = useTranslation();
  const { data: templates = [] } = useQuery(
    publishedTemplatesQueryOptions(siteId),
  );
  const { data: unpublished = 0 } = useQuery(
    unpublishedTemplateCountQueryOptions(siteId),
  );

  if (templates.length === 0 && unpublished === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5 border-t pt-3">
      <span className="text-xs font-medium text-muted-foreground">
        {t('sections.templates')}
      </span>
      {templates.map((template) => (
        <ListItemButton
          key={template.id}
          disabled={disabled}
          onClick={() =>
            onInsert(
              // New ids on every copy: two copies of one template on one
              // page would otherwise share block ids, and a per-instance
              // style set on one would land on both.
              copySectionBlocks(template.publishedContent, () =>
                crypto.randomUUID(),
              ) as (Block & { id: string })[],
            )
          }
        >
          {template.name}
        </ListItemButton>
      ))}
      {/* A template made and not published is not here, and nothing said
          why: it looked like a template that had not been saved. */}
      {unpublished > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('sections.unpublishedTemplates', { count: unpublished })}
        </p>
      )}
    </div>
  );
}
