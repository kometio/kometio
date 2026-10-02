import type { CookiePreferencesProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/**
 * "Cookie preferences" — the link a footer needs so that consent can be
 * changed as easily as it was given (GDPR art. 7(3)). It opens the site's
 * own cookie banner, and is not drawn at all on a site that has none.
 */
export const cookiePreferencesBlock: BlockDescriptor<CookiePreferencesProps> = {
  type: 'CookiePreferences',
  label: 'blocks.cookiePreferences.label',
  category: 'interactive',
  icon: 'cookie',
  defaultProps: { label: '' },
  fields: [
    {
      kind: 'text',
      key: 'label',
      translatable: true,
      // Not edited in place: the words sit inside a <button>, where typing
      // a space presses it.
      label: 'blocks.cookiePreferences.fields.label.fieldLabel',
    },
  ],
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.CookiePreferences,
};
