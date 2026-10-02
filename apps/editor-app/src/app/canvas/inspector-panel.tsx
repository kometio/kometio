import { ChevronDown } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import {
  blockAlignSchema,
  type Block,
  type BlockAlign,
  type PickedSection,
} from '@kometio/shared-types';
import { OptionsSelect } from '../../components/ui/select';
import { SectionInstanceFields } from './section-instance-fields';
import { FieldEntry, type SectionExposeControls } from './inspector-field';
import type {
  BlockDescriptor,
  FieldDescriptor,
  FieldGroup,
} from '@kometio/block-registry';
import { isFieldVisible } from '@kometio/block-registry';
import { useTranslation } from '../../lib/use-translation';

export interface InspectorPanelProps {
  block: Block;
  descriptor: BlockDescriptor;
  onChangeProp: (key: string, value: unknown) => void;
  /** Picking one of the type's declared looks (ADR-0047). `undefined` = the type's own default. */
  onChangeVariant: (variant: string | undefined) => void;
  /**
   * How much page width this block claims (ADR-0049). Absent for a nested
   * block: a block inside a Container or a Column is laid out by whatever
   * holds it, so the control would promise something the page cannot do.
   */
  onChangeAlign?: (align: BlockAlign | undefined) => void;
  /**
   * Present only inside the reusable-section editor (docs/adr/0059): it
   * turns each field into something a page instance may or may not change.
   * `exposed` is the field keys already unlocked for THIS block.
   */
  sectionEditing?: SectionExposeControls;
  /**
   * The per-instance style controls, drawn by the caller and placed in
   * the "Style" group here (ADR-0062).
   *
   * A slot rather than a dozen more props: the toolbar already holds
   * everything `BlockStyleFields` needs — the theme's ceiling, the
   * properties it added, the current breakpoint, the resolved defaults,
   * the tokens — and threading all of that through this component would
   * make the inspector know about styling it does not otherwise touch.
   * What it decides is WHERE those controls go, which is exactly what a
   * slot expresses.
   */
  instanceStyleFields?: ReactNode;
}

/** Content first, then the look, then what most people never touch (ADR-0062). */
const GROUP_ORDER: readonly FieldGroup[] = ['content', 'style', 'advanced'];

const ALIGN_OPTIONS: readonly BlockAlign[] = ['content', 'wide', 'full'];

/**
 * Open unless it is `advanced`: the whole point of that group is to be
 * out of the way until someone goes looking for it, while hiding content
 * or style behind a click would cost every edit an extra one.
 */
function isGroupOpenByDefault(group: FieldGroup): boolean {
  return group !== 'advanced';
}

interface FieldSectionProps {
  group: FieldGroup;
  children: ReactNode;
}

function FieldSection({ group, children }: FieldSectionProps) {
  const { t } = useTranslation();
  return (
    <details
      open={isGroupOpenByDefault(group)}
      className="group border-b pb-3 last:border-b-0 last:pb-0"
    >
      {/* The chevron says the heading opens and closes: without it the
          Advanced group looked like an empty heading, and a closed group
          was a secret. */}
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-sm text-xs font-semibold tracking-wide text-muted-foreground uppercase marker:content-[''] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        {t(`canvas.fieldGroup.${group}`)}
        <ChevronDown
          aria-hidden="true"
          className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="mt-2.5 flex flex-col gap-3">{children}</div>
    </details>
  );
}

/**
 * The selected block's fields, one input each, driven by its
 * `BlockDescriptor`. A text field the descriptor marks `inlineEditable` can
 * also be edited on the canvas with a double click (use-text-edit.ts);
 * this panel stays the one place that reaches every field.
 */
export function InspectorPanel({
  block,
  descriptor,
  onChangeProp,
  onChangeVariant,
  onChangeAlign,
  sectionEditing,
  instanceStyleFields,
}: InspectorPanelProps) {
  const { t, tLabel } = useTranslation();
  const alignHintId = useId();
  const variants = descriptor.variants ?? [];
  // A section instance's inputs cannot come from the descriptor — see
  // SectionInstanceFields for why — so this one type is special-cased
  // here rather than through a general mechanism nothing else uses.
  const isSectionInstance = descriptor.type === 'Section';
  // Hidden fields are dropped before anything else looks at them: a
  // field that is not shown must not draw its required warning either,
  // or an image marked decorative would keep nagging about the alt text
  // it no longer asks for.
  const visibleFields = descriptor.fields.filter((field) =>
    isFieldVisible(field, block.props),
  );
  const fieldsByGroup = (group: FieldGroup) =>
    visibleFields.filter((field) => (field.group ?? 'content') === group);
  // Not `fields.length === 0`: a type may offer a look and no fields at
  // all, and returning null there would hide the only control it has —
  // width and the per-instance style included, which a block can have
  // whether or not its type declares a single field.
  if (
    descriptor.fields.length === 0 &&
    variants.length === 0 &&
    !onChangeAlign &&
    !instanceStyleFields &&
    !isSectionInstance
  ) {
    return null;
  }

  const renderFields = (fields: FieldDescriptor[]) =>
    fields.map((field) => (
      <FieldEntry
        key={field.key}
        field={field}
        block={block}
        onChangeProp={onChangeProp}
        sectionEditing={sectionEditing}
      />
    ));

  // What each group holds beyond its own fields: the look and the width
  // are style by definition, and a section instance's inputs are content.
  const hasStyleExtras =
    variants.length > 0 ||
    Boolean(onChangeAlign) ||
    Boolean(instanceStyleFields);
  const extras: Record<FieldGroup, ReactNode> = {
    content: isSectionInstance ? (
      <SectionInstanceFields
        section={
          isPickedSection(block.props['section'])
            ? block.props['section']
            : null
        }
        props={block.props}
        onChangeProp={onChangeProp}
      />
    ) : null,
    // A fragment is truthy even when every one of its children is
    // absent, so the emptiness of the group is decided here rather than
    // by looking at the node — otherwise a block with no look, no width
    // and no styling still got a "Style" heading over nothing.
    style: !hasStyleExtras ? null : (
      <>
        {variants.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t('canvas.variant.fieldLabel')}
            </span>
            <OptionsSelect
              aria-label={t('canvas.variant.fieldLabel')}
              value={block.variant ?? ''}
              onValueChange={(next) => onChangeVariant(next || undefined)}
              options={[
                // The type's own look has no variant of its own, so the
                // empty value means "none" rather than naming one.
                { value: '', label: t('canvas.variant.default') },
                ...variants.map((variant) => ({
                  value: variant.value,
                  label: tLabel(variant.label),
                })),
              ]}
            />
          </div>
        )}
        {onChangeAlign && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t('canvas.align.fieldLabel')}
            </span>
            <OptionsSelect
              aria-label={t('canvas.align.fieldLabel')}
              aria-describedby={alignHintId}
              value={block.align ?? 'content'}
              onValueChange={(next) => {
                const align = blockAlignSchema.safeParse(next);
                if (!align.success) return;
                // `content` is the default and is stored as its absence, so
                // the block does not carry a field saying "behave normally".
                onChangeAlign(
                  align.data === 'content' ? undefined : align.data,
                );
              }}
              options={ALIGN_OPTIONS.map((option) => ({
                value: option,
                label: t(`canvas.align.${option}`),
              }))}
            />
            <span id={alignHintId} className="text-xs text-muted-foreground">
              {t('canvas.align.hint')}
            </span>
          </div>
        )}
        {instanceStyleFields}
      </>
    ),
    advanced: null,
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">{tLabel(descriptor.label)}</h3>
      {GROUP_ORDER.map((group) => {
        const fields = fieldsByGroup(group);
        const extra = extras[group];
        // An empty group is not drawn at all — a "Style" heading over
        // nothing tells the reader this block has styling it does not
        // have.
        if (fields.length === 0 && !extra) return null;
        return (
          <FieldSection key={group} group={group}>
            {renderFields(fields)}
            {extra}
          </FieldSection>
        );
      })}
    </div>
  );
}

/** The saved value is jsonb, so what it is has to be checked, not asserted. */
function isPickedSection(value: unknown): value is PickedSection {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sectionId' in value &&
    typeof value.sectionId === 'string'
  );
}
