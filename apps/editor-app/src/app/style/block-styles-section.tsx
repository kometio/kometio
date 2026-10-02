import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BlockDescriptor } from '@kometio/block-registry';
import type { SiteRecord } from '@kometio/api-contracts';
import { type ResponsiveBlockStyle } from '@kometio/shared-types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../components/ui/accordion';
import { ListItemButton } from '../../components/ui/list-item-button';
import { useTranslation } from '../../lib/use-translation';
import { actionErrorMessage } from '../../lib/http-client';
import { updateThemeTokens as sendThemeTokens } from '../../lib/sites-api-client';
import type { Breakpoint } from '../canvas/breakpoint-selector';
import type { BlockPickerCategory } from '../canvas/block-picker';
import { SettingsSectionHeader } from '../settings/settings-section';
import { useSiteUpdate } from '../settings/use-site-update';
import { InlineError } from '../../components/ui/inline-error';
import { blockStyleDefaultsQueryOptions } from './block-style-defaults-queries';
import { BlockStylesTypeEditor } from './block-styles-type-editor';
import { themeBaseTokensQueryOptions } from './theme-base-tokens-queries';
import { themeStylePropertiesQueryOptions } from './theme-style-properties-queries';

export interface BlockStylesSectionProps {
  site: SiteRecord;
  /** Every block type: only the ones with something to style are listed (docs/adr/0022). */
  registry: BlockDescriptor[];
  /** The same categories and labels as the insert palette, so blocks are grouped the same way throughout the editor. */
  categories: BlockPickerCategory[];
}

/**
 * What every block of a type looks like on the whole site — background,
 * text colour, corners, padding (docs/adr/0022): a list of the types that
 * can be styled, and one type's fields when it is opened.
 *
 * Each change is saved as it is made, as it was in the canvas's panel, and
 * the section says so and says when it has landed: a page whose bar says
 * "Unsaved changes" a few inches from fields that are already saved is a
 * page that lies about one of them.
 */
export function BlockStylesSection({
  site,
  registry,
  categories,
}: BlockStylesSectionProps) {
  const { t, tLabel } = useTranslation();
  const { save, isSaving } = useSiteUpdate(site.id, sendThemeTokens);
  const { data: defaults } = useQuery(
    blockStyleDefaultsQueryOptions(site.themeName),
  );
  const { data: baseTokens } = useQuery(
    themeBaseTokensQueryOptions(site.themeName),
  );
  const { data: themeProperties } = useQuery(
    themeStylePropertiesQueryOptions(site.themeName),
  );
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('base');
  const [error, setError] = useState('');
  const [hasSaved, setHasSaved] = useState(false);

  async function saveTypeStyle(
    blockType: string,
    variant: string,
    style: ResponsiveBlockStyle,
  ) {
    setError('');
    try {
      await save({ blockType, variant, style });
      setHasSaved(true);
    } catch (err) {
      setError(actionErrorMessage(err, t('canvas.style.saveError')));
    }
  }

  const styleableCategories = categories
    .map((category) => ({
      ...category,
      descriptors: category.types
        .map((type) => registry.find((block) => block.type === type))
        .filter(
          (descriptor): descriptor is BlockDescriptor =>
            !!descriptor && (descriptor.stylableProperties?.length ?? 0) > 0,
        ),
    }))
    .filter((category) => category.descriptors.length > 0);

  const selectedDescriptor = selectedType
    ? registry.find((descriptor) => descriptor.type === selectedType)
    : undefined;

  return (
    <section
      aria-labelledby="style-blocks-title"
      className="flex flex-col gap-3"
      // A field of a block's style is not a field of the form around this
      // section, and Enter in one must not save the colours above it.
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
          event.preventDefault();
        }
      }}
    >
      <SettingsSectionHeader
        id="style-blocks-title"
        title={
          selectedDescriptor
            ? t('canvas.style.editType', {
                type: tLabel(selectedDescriptor.label),
              })
            : t('globalStyles.blockStylesTitle')
        }
        description={t('globalStyles.blockStylesHint')}
      />
      {selectedDescriptor ? (
        <BlockStylesTypeEditor
          descriptor={selectedDescriptor}
          typeStyles={site.themeTokens?.blockStyles[selectedDescriptor.type]}
          breakpoint={breakpoint}
          onBreakpointChange={setBreakpoint}
          themeProperties={themeProperties?.[selectedDescriptor.type]}
          defaults={defaults?.[selectedDescriptor.type]}
          baseTokens={baseTokens}
          onSave={saveTypeStyle}
          onBack={() => setSelectedType(null)}
        />
      ) : (
        <Accordion type="multiple">
          {styleableCategories.map((category) => (
            <AccordionItem key={category.title} value={category.title}>
              <AccordionTrigger>{tLabel(category.title)}</AccordionTrigger>
              <AccordionContent>
                <ul className="flex flex-col gap-0.5">
                  {category.descriptors.map((descriptor) => (
                    <li key={descriptor.type}>
                      <ListItemButton
                        onClick={() => setSelectedType(descriptor.type)}
                      >
                        {tLabel(descriptor.label)}
                      </ListItemButton>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
      <InlineError>{error}</InlineError>
      {/* A live region that is always there, so the first save is said. */}
      <p role="status" className="text-xs text-muted-foreground">
        {isSaving
          ? t('globalStyles.blockStylesSaving')
          : hasSaved && !error
            ? t('globalStyles.blockStylesSaved')
            : ''}
      </p>
    </section>
  );
}
