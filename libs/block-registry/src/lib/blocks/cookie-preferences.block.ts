import { cookiePreferencesBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

/**
 * "Cookie preferences" — the link a footer needs so that consent can be
 * changed as easily as it was given (GDPR art. 7(3)). It opens the site's
 * own cookie banner, and is not drawn at all on a site that has none.
 */
export const cookiePreferencesBlock = coreBlock(
  cookiePreferencesBlockContract,
  {
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
  },
);
