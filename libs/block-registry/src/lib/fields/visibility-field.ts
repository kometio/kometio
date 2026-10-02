import type { FieldDescriptor } from '../field-types';

/**
 * Shared by every block with a `Visibility` prop (Nav, HamburgerMenu,
 * NavLink, LanguageSwitcher, Breadcrumb, SearchBox, BackToTop,
 * WhatsAppButton, PromoBar) so the options aren't duplicated per block —
 * see visibilitySchema in @kometio/shared-types for what each value maps
 * to at render time (apps/public-site's visibility.css).
 */
export const visibilityField: FieldDescriptor = {
  kind: 'radio',
  key: 'visibility',
  label: 'blocks.shared.visibility.fieldLabel',
  options: [
    { label: 'blocks.shared.visibility.options.always', value: 'always' },
    {
      label: 'blocks.shared.visibility.options.desktopOnly',
      value: 'desktop-only',
    },
    {
      label: 'blocks.shared.visibility.options.mobileOnly',
      value: 'mobile-only',
    },
  ],
};
