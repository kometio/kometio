import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import type { PublishedTemplate } from '../sections/reusable-sections-queries';

/** Radix Select cannot hold an empty value, and "no template" is a real answer. */
const BLANK = '__blank__';
/** "Describe it to AI" — only where a page is being created. */
const GENERATE = '__generate__';

export interface PageTemplateSelectProps {
  id: string;
  templates: PublishedTemplate[];
  /** `null` for a blank page. */
  value: string | null;
  onChange: (templateId: string | null) => void;
  /**
   * Offers "Describe it to AI" too, where a new page is being created and
   * the site can generate one. Not a template: choosing it hands over to
   * the caller, and `value` is then ignored.
   */
  generation?: { selected: boolean; onSelect: () => void };
  size?: 'sm' | 'default';
  className?: string;
}

/**
 * "Blank page", then the site's published templates (docs/adr/0072) — the
 * one question asked both when a page is created and when a collection
 * picks what its new pages start from, so it is asked the same way in
 * both places.
 *
 * A value that is not among the templates reads as "Blank page", never as
 * an empty box: a collection's default deleted a moment ago is still in a
 * cached answer, while the server has already cleared it.
 */
export function PageTemplateSelect({
  id,
  templates,
  value,
  onChange,
  generation,
  size,
  className,
}: PageTemplateSelectProps) {
  const { t } = useTranslation();
  const current = generation?.selected
    ? GENERATE
    : value !== null && templates.some((template) => template.id === value)
      ? value
      : BLANK;
  return (
    <Select
      value={current}
      onValueChange={(next) => {
        if (next === GENERATE) generation?.onSelect();
        else onChange(next === BLANK ? null : next);
      }}
    >
      <SelectTrigger id={id} size={size} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={BLANK}>{t('pageTemplates.blank')}</SelectItem>
        {generation && (
          <SelectItem value={GENERATE}>
            {t('pageGeneration.startFrom')}
          </SelectItem>
        )}
        {templates.map((template) => (
          <SelectItem key={template.id} value={template.id}>
            {template.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
