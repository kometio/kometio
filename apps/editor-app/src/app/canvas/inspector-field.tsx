import { useId } from 'react';
import { Checkbox } from '../../components/ui/checkbox';
import { type Block } from '@kometio/shared-types';
import { OptionsSelect } from '../../components/ui/select';
import { CUSTOM_FIELD_CONTROLS } from './custom-fields/custom-field-controls';
import { RichTextField } from './custom-fields/rich-text-field';
import type { FieldDescriptor } from '@kometio/block-registry';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { useTranslation } from '../../lib/use-translation';

export interface FieldRowProps {
  field: FieldDescriptor;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Scopes a radio group's `name` — see the `radio` case. */
  blockId?: string;
  /** The control's own id, which the caption's `<label htmlFor>` names (see `captionIsLabel`). */
  controlId: string;
  /** The caption's id, for a control named by pointing at it: a radio group, rich text. */
  captionId: string;
  /** The required-field warning's id, while it shows. */
  describedBy?: string;
}

/** One input per field `kind` — which control a field gets is the descriptor's to say, never the block's. */
export function FieldRow({
  field,
  value,
  onChange,
  blockId,
  controlId,
  captionId,
  describedBy,
}: FieldRowProps) {
  const { tLabel } = useTranslation();
  switch (field.kind) {
    case 'text':
      return (
        <Input
          id={controlId}
          aria-describedby={describedBy}
          type="text"
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'textarea':
      return (
        <Textarea
          id={controlId}
          aria-describedby={describedBy}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          rows={4}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'richtext':
      return (
        <RichTextField
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
          placeholder={field.placeholder}
          labelledBy={captionId}
        />
      );
    case 'number':
      return (
        <Input
          id={controlId}
          aria-describedby={describedBy}
          type="number"
          value={typeof value === 'number' ? value : ''}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(event) => {
            // An empty input is not zero. For a field that declares
            // itself optional it means "no value" — clearing a column's
            // width is how you give it back its equal share — and saving
            // `0` there would store a number outside the property's own
            // range while looking like something the user picked.
            const raw = event.target.value;
            if (field.optional && raw === '') {
              onChange(undefined);
              return;
            }
            onChange(Number(raw));
          }}
        />
      );
    case 'boolean':
      return (
        <Checkbox
          id={controlId}
          aria-describedby={describedBy}
          checked={Boolean(value)}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
      );
    case 'radio':
      /*
       * A real radio group. `radio` and `select` used to fall through to
       * the same `<select>`, which made the two kinds indistinguishable —
       * a descriptor could say `radio`, the editor drew a dropdown, and
       * the difference existed only in the type.
       *
       * They are not interchangeable: a radio group shows every option at
       * once, which is what a three-way choice like a Container's padding
       * wants, while a dropdown hides all but one, which is what a
       * sixty-item list needs. Now the descriptor decides.
       */
      return (
        <div
          role="radiogroup"
          aria-labelledby={captionId}
          aria-describedby={describedBy}
          className="flex flex-wrap gap-2"
        >
          {field.options.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-1.5 text-sm"
            >
              <input
                type="radio"
                className="size-4 border-input"
                // Scoped to this field AND this block: two blocks of the
                // same type on one page would otherwise share a radio
                // group, and picking on one would clear the other.
                name={`${blockId ?? 'block'}-${field.key}`}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
              />
              {tLabel(option.label)}
            </label>
          ))}
        </div>
      );
    case 'select':
      return (
        <OptionsSelect
          id={controlId}
          aria-describedby={describedBy}
          value={typeof value === 'string' ? value : ''}
          onValueChange={onChange}
          options={field.options.map((option) => ({
            value: option.value,
            label: tLabel(option.label),
          }))}
        />
      );
    case 'custom': {
      // The descriptor names a control; the map is what knows how to draw
      // it. See custom-field-controls.tsx for why that indirection exists.
      const Custom = CUSTOM_FIELD_CONTROLS[field.control];
      return (
        <Custom value={value} onChange={onChange} label={tLabel(field.label)} />
      );
    }
  }
}

/** What a dotted path (`media.alt`) holds in `props`, or `undefined` along the way: a block saved before a key existed has no such branch. */
function readPath(props: Record<string, unknown>, path: string): unknown {
  let current: unknown = props;
  for (const key of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = Object.entries(current).find(([name]) => name === key)?.[1];
  }
  return current;
}

function isFilledText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * A soft nudge, never a save/publish blocker (see docs/adr for the
 * alt-text accessibility gap this exists for) — `requiredUnless` lets a
 * sibling boolean prop (e.g. "isDecorative") waive it legitimately,
 * instead of every empty value being flagged as an oversight.
 */
export function isRequiredFieldEmpty(
  field: FieldDescriptor,
  props: Record<string, unknown>,
): boolean {
  if (!field.required) return false;
  // Only the free-text kinds can waive it through a sibling flag, which
  // is where that idea came from (an image that is decorative on
  // purpose). Reading it off the others would be reading a property
  // they do not have.
  if (
    (field.kind === 'text' ||
      field.kind === 'textarea' ||
      field.kind === 'richtext') &&
    field.requiredUnless &&
    props[field.requiredUnless]
  ) {
    return false;
  }
  // Empty here, but the field says where its value comes from instead — an
  // image's alternative text is the file's own — so nothing has been
  // forgotten.
  if (
    (field.kind === 'text' ||
      field.kind === 'textarea' ||
      field.kind === 'richtext') &&
    field.fallbackFrom &&
    isFilledText(readPath(props, field.fallbackFrom))
  ) {
    return false;
  }
  const value = props[field.key];
  // A picker holds an object or nothing at all — the page picker is the
  // reason this function stopped being about text (ADR-0063). A date or a
  // time control holds a string, and the empty one is its nothing: an
  // event with no date is exactly what the warning is for. Everything
  // else here is judged as text, which is what the remaining kinds that
  // declare `required` actually hold.
  if (field.kind === 'custom') return value == null || value === '';
  return typeof value !== 'string' || value.trim().length === 0;
}

/**
 * Whether the caption is a real `<label>` for the field's one control.
 *
 * Every field used to sit inside a `<label>`, which is right for one input
 * and wrong for anything else: a label names only the first control inside
 * it, with ALL of its text — the icon field's "Change icon" button was
 * called "Icon Remove icon" — and a radio option's own label, or the
 * section editor's checkbox, ended up as a label inside a label, which
 * HTML does not allow. So only a field that is one control gets a label;
 * the rest point at their caption.
 */
export function captionIsLabel(field: FieldDescriptor): boolean {
  return (
    field.kind === 'text' ||
    field.kind === 'textarea' ||
    field.kind === 'number' ||
    field.kind === 'boolean' ||
    field.kind === 'select'
  );
}

/**
 * The section editor's expose controls for ONE block (docs/adr/0059):
 * `exposed` is the field keys already unlocked for it.
 */
export interface SectionExposeControls {
  exposed: string[];
  onToggle: (field: string) => void;
}

export interface FieldEntryProps {
  field: FieldDescriptor;
  block: Block;
  onChangeProp: (key: string, value: unknown) => void;
  sectionEditing?: SectionExposeControls;
}

/** One field: its caption, its control, and what is said about it. */
export function FieldEntry({
  field,
  block,
  onChangeProp,
  sectionEditing,
}: FieldEntryProps) {
  const { t, tLabel } = useTranslation();
  const id = useId();
  const controlId = `${id}control`;
  const captionId = `${id}caption`;
  const warningId = `${id}warning`;
  const showRequiredWarning = isRequiredFieldEmpty(field, block.props);
  const describedBy = showRequiredWarning ? warningId : undefined;
  // A field made of several controls — rich text, a picker with a remove
  // button, a table — is a group named by its caption; each control inside
  // keeps a name of its own. A radio group is one already.
  const isGroup = field.kind === 'custom' || field.kind === 'richtext';
  const caption = (
    <>
      {tLabel(field.label)}
      {/* Seen, not read: the warning below says it in words. */}
      {field.required && (
        <span aria-hidden="true" className="text-destructive">
          {' '}
          *
        </span>
      )}
    </>
  );
  const captionClass = 'text-xs font-medium text-muted-foreground';
  return (
    <div
      className="flex flex-col gap-1.5"
      {...(isGroup
        ? {
            role: 'group',
            'aria-labelledby': captionId,
            'aria-describedby': describedBy,
          }
        : {})}
    >
      {captionIsLabel(field) ? (
        <label id={captionId} htmlFor={controlId} className={captionClass}>
          {caption}
        </label>
      ) : (
        <span id={captionId} className={captionClass}>
          {caption}
        </span>
      )}
      <FieldRow
        field={field}
        value={block.props[field.key]}
        blockId={block.id}
        onChange={(value) => onChangeProp(field.key, value)}
        controlId={controlId}
        captionId={captionId}
        describedBy={describedBy}
      />
      {showRequiredWarning && (
        <span id={warningId} className="text-xs text-warning">
          {t('canvas.requiredField')}
        </span>
      )}
      {/* Only inside the section editor: it is the section's author
          deciding what a page may change about this field, and it
          is deliberately per FIELD rather than per block — "the
          title, and nothing else" is the whole point
          (docs/adr/0059). Described by the caption, since its own
          words do not say which field it unlocks. */}
      {sectionEditing && (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox
            aria-describedby={captionId}
            checked={sectionEditing.exposed.includes(field.key)}
            onCheckedChange={() => sectionEditing.onToggle(field.key)}
          />
          {t('sections.exposeField')}
        </label>
      )}
    </div>
  );
}
