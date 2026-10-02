import { useTranslation as useTranslationBase } from 'react-i18next';

/**
 * Wraps react-i18next's `useTranslation` to add `tLabel`, a second
 * translator for keys that only exist as plain `string` at compile time.
 *
 * `t()` is intentionally typed against `it.json`'s literal key union (see
 * `../i18n.ts`'s module augmentation) so a typo in a hardcoded call site is
 * caught at compile time. But `BlockDescriptor.label`/`FieldDescriptor.label`/
 * `BlockPickerCategory.title` (from `@kometio/block-registry`, which has no
 * `react-i18next` dependency by design) are typed as plain `string` — by our
 * own convention they always hold a valid translation key, but nothing in
 * TypeScript's structural type system can express that invariant across the
 * package boundary. Passing `{ defaultValue: key }` uses i18next's own
 * escape hatch for this exact situation: with a `defaultValue` present, `t`
 * accepts a plain `string | string[]` key instead of requiring a literal
 * from the known key union — no `as` cast needed. The default is never
 * actually shown (the key always resolves, by the same convention), it just
 * satisfies the overload; concentrated in one wrapper instead of repeated at
 * every call site that renders a descriptor label/title.
 */
export function useTranslation() {
  const translation = useTranslationBase();
  const { t } = translation;
  return {
    ...translation,
    tLabel: (key: string): string => t(key, { defaultValue: key }),
  };
}
