import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import type { BlockDescriptor } from '@kometio/block-registry';
import {
  DEFAULT_VARIANT,
  withBreakpointStyle,
  type ResponsiveBlockStyle,
} from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import { OptionsSelect } from '../../components/ui/select';
import { useTranslation } from '../../lib/use-translation';
import {
  BreakpointSelector,
  type Breakpoint,
} from '../canvas/breakpoint-selector';
import {
  BlockStyleFields,
  type BlockStyleFieldsProps,
} from '../canvas/block-style-fields';

/**
 * The properties that mean something when set for a whole TYPE.
 *
 * `marginTop`/`marginBottom` do not: the CSS for them is emitted by
 * `spacingRules`, which the per-instance builder calls and the per-type
 * builder does not (block-style-overrides.ts). Offering them here stored
 * a value and rendered nothing — a control that looks like it works.
 *
 * The block toolbar used to filter them out of its own type popover and
 * this screen did not, so the rule lived in one of the two places that
 * needed it. That popover is gone; this is now the only place, and the
 * rule came with it.
 */
export function typeStylableProperties(
  descriptor: BlockDescriptor,
): readonly string[] {
  return (descriptor.stylableProperties ?? []).filter(
    (property) => property !== 'marginTop' && property !== 'marginBottom',
  );
}

export interface BlockStylesTypeEditorProps extends Pick<
  BlockStyleFieldsProps,
  'themeProperties' | 'defaults'
> {
  descriptor: BlockDescriptor;
  /** What the site stored for this type: `[variant][breakpoint]`, absent when nothing was set. */
  typeStyles: Record<string, ResponsiveBlockStyle> | undefined;
  breakpoint: Breakpoint;
  onBreakpointChange: (breakpoint: Breakpoint) => void;
  /** The active theme's own colours, offered as swatches. */
  baseTokens: BlockStyleFieldsProps['themeTokens'];
  onSave: (
    blockType: string,
    variant: string,
    style: ResponsiveBlockStyle,
  ) => Promise<void>;
  onBack: () => void;
}

/**
 * One block type's style for the whole site: which breakpoint and which
 * look of the type is being painted, and its fields.
 *
 * The look is this component's own state, so it starts from the type's own
 * each time a type is opened. It used to live in the dialog and survive a
 * close, and the next type opened showed a look it might not have.
 */
export function BlockStylesTypeEditor({
  descriptor,
  typeStyles,
  breakpoint,
  onBreakpointChange,
  themeProperties,
  defaults,
  baseTokens,
  onSave,
  onBack,
}: BlockStylesTypeEditorProps) {
  const { t, tLabel } = useTranslation();
  const [variant, setVariant] = useState<string>(DEFAULT_VARIANT);

  return (
    <div className="flex flex-col gap-4">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit"
        onClick={onBack}
      >
        <ChevronLeft size={16} />
        {t('globalStyles.back')}
      </Button>
      <p className="text-xs text-muted-foreground">
        {t('canvas.style.editTypeHint', {
          type: tLabel(descriptor.label),
        })}
      </p>
      {/*
        Without this the dialog would quietly edit the base size
        only: a per-type style is per breakpoint like any other
        (ADR-0047), and a control that silently writes to one of
        three buckets is exactly the kind of gap somebody discovers
        months later, on a published site.
      */}
      <BreakpointSelector
        value={breakpoint}
        onChange={onBreakpointChange}
        label={t('globalStyles.breakpointGroup')}
      />
      {(descriptor.variants?.length ?? 0) > 0 && (
        // Which LOOK of the type is being painted (ADR-0047). A
        // type with one look shows nothing here — there is only one
        // thing this panel could mean.
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {t('globalStyles.variantGroup')}
          </span>
          <OptionsSelect
            aria-label={t('globalStyles.variantGroup')}
            value={variant}
            onValueChange={setVariant}
            options={[
              {
                value: DEFAULT_VARIANT,
                label: t('canvas.variant.default'),
              },
              ...(descriptor.variants ?? []).map((option) => ({
                value: option.value,
                label: tLabel(option.label),
              })),
            ]}
          />
        </div>
      )}
      {/* The controls scroll, the way in and out stay put: there are
          twenty of them for a Hero, and a dialog taller than the screen
          put the Back button beyond its top edge. */}
      <div className="max-h-[min(26rem,55vh)] overflow-y-auto">
        <BlockStyleFields
          blockType={descriptor.type}
          themeProperties={themeProperties}
          properties={typeStylableProperties(descriptor)}
          value={typeStyles?.[variant]?.[breakpoint] ?? {}}
          onChange={(next) =>
            void onSave(
              descriptor.type,
              variant,
              withBreakpointStyle(typeStyles?.[variant], breakpoint, next),
            )
          }
          defaults={defaults}
          themeTokens={baseTokens}
        />
      </div>
    </div>
  );
}
