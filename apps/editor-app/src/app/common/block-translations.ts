import i18next from '../../i18n';

/**
 * Where a block type's strings live in the editor's translations:
 * `Hero` → `hero`, `PricingPlan` → `pricingPlan`, read as
 * `blocks.<key>.…`. Written out by hand in five places before.
 */
export function blockTranslationKey(blockType: string): string {
  return `${blockType.charAt(0).toLowerCase()}${blockType.slice(1)}`;
}

/**
 * Adds a theme's strings for one block type, in both of the editor's
 * languages, under `blocks.<key>` — merged over what core already has, so
 * a theme adds labels without taking any away.
 */
export function registerBlockTranslations(
  blockType: string,
  byLocale: Record<'en' | 'it', Record<string, unknown>>,
): void {
  for (const locale of ['en', 'it'] as const) {
    i18next.addResourceBundle(
      locale,
      'translation',
      { blocks: { [blockTranslationKey(blockType)]: byLocale[locale] } },
      true,
      true,
    );
  }
}
