import { FieldBuilder, type FieldDescriptor } from '../field-types';

/**
 * Shared by every block with a "page or url" prop (NavLink, Button, Link,
 * Banner, PromoBar, PricingPlan) — drives which of `page`/`url` the
 * editor is actually filling in, and since ADR-0062 which of the two the
 * editor even shows: the other one was visible and inert, an input that
 * accepted what you typed and then ignored it.
 */
const linkTypeField: FieldDescriptor = {
  kind: 'radio',
  key: 'linkType',
  label: 'blocks.shared.linkType.fieldLabel',
  options: [
    { label: 'blocks.shared.linkType.options.page', value: 'page' },
    { label: 'blocks.shared.linkType.options.url', value: 'url' },
  ],
};

/**
 * Security review 2026-08-24, point 16: `linkTypeField` + the page picker
 * + the URL field showed up copy-pasted identically across 6 blocks
 * (Banner, Button, Link, NavLink, PricingPlan, PromoBar) — a single
 * place they're derived from.
 */
export function ctaLinkFields({
  required = true,
}: {
  /**
   * `false` for a block that is whole without a link — a product card or
   * an event that simply does not point anywhere yet. Warning that the
   * field is required there would be telling somebody off for a choice.
   */
  required?: boolean;
} = {}): FieldDescriptor[] {
  return [
    linkTypeField,
    FieldBuilder.custom(
      'page',
      'blocks.shared.linkType.pageFieldLabel',
      'page',
      { showWhen: { field: 'linkType', equals: 'page' }, required },
    ),
    {
      kind: 'text',
      key: 'url',
      showWhen: { field: 'linkType', equals: 'url' },
      // Both destinations are required, and only ever one of them is on
      // screen: whichever the block says it points at is the one that
      // has to be filled in, or it points nowhere (ADR-0063).
      required,
      label: 'blocks.shared.linkType.urlFieldLabel',
      // Found live during the i18n backfill (not just theorized): a real
      // site often uses this field for a hand-written relative internal
      // path (e.g. "/it/docs") instead of the actual PagePickerField — a
      // url like that MUST vary per language, it's not just an external
      // link that's "always the same everywhere". A genuinely external
      // url (rarely needs to differ per language) still stays editable
      // per-locale with this flag, minimal cost to avoid silently
      // breaking internal navigation.
      translatable: true,
    },
  ];
}
