import type { ComponentType } from 'react';
import type { CustomFieldControl } from '@kometio/block-registry';
import { ColorPickerField } from './color-picker-field';
import { DateField, TimeField } from './date-time-fields';
import { FeatureListField } from './feature-list-field';
import { FormPickerField } from './form-picker-field';
import { GalleryPickerField } from './gallery-picker-field';
import { IconField } from './icon-picker-field';
import {
  AudioPickerField,
  FilePickerField,
  MediaPickerField,
  VideoPickerField,
} from './media-picker-field';
import { PagePickerField } from './page-picker-field';
import { SectionPickerField } from './section-picker-field';
import { TableDataField } from './table-data-field';
import { TaxonomyPickerField } from './taxonomy-picker-field';
import { TermPickerField } from './term-picker-field';

type ControlComponent = ComponentType<{
  value: unknown;
  onChange: (value: unknown) => void;
  /**
   * The field's own label. The inspector's caption names the field as a
   * group, never a control inside it, so every control that holds an
   * input or a select names it with this.
   */
  label?: string;
}>;

/**
 * The one place a `kind: 'custom'` field's NAME becomes a component.
 *
 * The name lives in the descriptor, which is data, and the component
 * lives here, which is the editor — so `@kometio/block-registry` no longer
 * carries React and can be read by anything: the API, to find which
 * fields hold rich text (ADR-0046); a theme, whose descriptors have to
 * survive JSON.
 *
 * There is no cast. Each picker used to type `value` to its own domain
 * (`PickedPage | null`, `PickedMedia | null`) and was asserted into this
 * map, on the promise that the block's schema guaranteed the pairing. It
 * did not: nothing in the editor parses props through a block's schema,
 * and a block saved before a field existed holds no key at all — the icon
 * field crashed on exactly that. So every control takes `unknown` and
 * reads it (`readPickedValue` for the pickers). `custom-field-controls.spec.tsx`
 * checks every control in the union has an entry, so the map cannot
 * silently fall behind the type.
 */
export const CUSTOM_FIELD_CONTROLS: Record<
  CustomFieldControl,
  ControlComponent
> = {
  audio: AudioPickerField,
  color: ColorPickerField,
  date: DateField,
  'feature-list': FeatureListField,
  file: FilePickerField,
  form: FormPickerField,
  gallery: GalleryPickerField,
  // Narrowed rather than cast: a block may hold no icon key at all.
  icon: IconField,
  media: MediaPickerField,
  page: PagePickerField,
  section: SectionPickerField,
  'table-data': TableDataField,
  term: TermPickerField,
  taxonomy: TaxonomyPickerField,
  time: TimeField,
  video: VideoPickerField,
};
