import type { BlockDescriptor, FieldDescriptor } from './field-types';
import { CUSTOM_FIELD_CONTROLS } from '@kometio/shared-types';

const KNOWN_CATEGORIES = [
  'layout',
  'content',
  'conversion',
  'media',
  'socialProof',
  'interactive',
] as const;

interface LocaleFieldFragment {
  fieldLabel?: unknown;
  options?: Record<string, unknown>;
}
interface LocaleFragment {
  label?: unknown;
  fields?: Record<string, LocaleFieldFragment>;
}

/**
 * One `themes/<name>/blocks/<Basename>.*` file set, already loaded (the
 * glob/import work is the caller's job — `apps/public-site/src/lib/
 * resolve-theme-page-blocks.ts` — this function is pure business-rule
 * validation, no file I/O). `descriptor` is already a real
 * `BlockDescriptor`: `defineBlock()` already ran `schema.parse(defaultProps)`
 * at import time, so a bad default already threw before this ever runs —
 * this function checks everything defineBlock() itself can't (i18n
 * completeness, category membership, cross-file consistency).
 */
export interface ThemeBlockCandidate {
  basename: string;
  descriptor: BlockDescriptor;
  hasRenderComponent: boolean;
  locales: { en?: LocaleFragment; it?: LocaleFragment } | undefined;
}

export interface ThemeBlockValidationError {
  basename: string;
  message: string;
}

function fieldLabelIssues(
  basename: string,
  localeName: 'en' | 'it',
  field: FieldDescriptor,
  fragment: LocaleFieldFragment | undefined,
): ThemeBlockValidationError[] {
  const errors: ThemeBlockValidationError[] = [];
  if (
    typeof fragment?.fieldLabel !== 'string' ||
    fragment.fieldLabel.length === 0
  ) {
    errors.push({
      basename,
      message: `${localeName}: missing fields.${field.key}.fieldLabel`,
    });
  }
  if (field.kind === 'radio' || field.kind === 'select') {
    for (const option of field.options) {
      const optionLabel = fragment?.options?.[option.value];
      if (typeof optionLabel !== 'string' || optionLabel.length === 0) {
        errors.push({
          basename,
          message: `${localeName}: missing fields.${field.key}.options.${option.value}`,
        });
      }
    }
  }
  return errors;
}

/**
 * `${type}` with its first character lowercased — the exact convention
 * every core block's own key already follows (`Heading` -> `blocks.heading`,
 * `EmbedHtml` -> `blocks.embedHtml`, `BeforeAfter` -> `blocks.beforeAfter`,
 * confirmed against apps/editor-app/src/locales/en.json). Not a case
 * conversion library call — this is literally the whole rule.
 */
function keyPrefix(type: string): string {
  return `blocks.${type.charAt(0).toLowerCase()}${type.slice(1)}`;
}

/**
 * `descriptor.label`/each field's `label`/each option's `label` are i18n
 * *keys* (see callout.block.ts — `label: 'blocks.callout.label'`, never
 * the English text itself), and nothing in `defineBlock()` ties that
 * string to the theme's own `.locales.json`. A typo here reproduces
 * exactly the bug this whole mechanism's own plan found and fixed for the
 * core `Heading` block (the raw key shown as visible text, silently, no
 * error) — `locales.json`'s own structural completeness (checked above by
 * `fieldLabelIssues`) doesn't catch it, since that only walks
 * `field.key`, never the descriptor's `label` string. Checked here
 * instead of trusting the author to get free-form string interpolation
 * right three times per field.
 */
function labelKeyIssues(
  basename: string,
  descriptor: BlockDescriptor,
): ThemeBlockValidationError[] {
  const errors: ThemeBlockValidationError[] = [];
  const prefix = keyPrefix(descriptor.type);

  const expectedLabel = `${prefix}.label`;
  if (descriptor.label !== expectedLabel) {
    errors.push({
      basename,
      message: `label "${descriptor.label}" must be exactly "${expectedLabel}"`,
    });
  }

  for (const field of descriptor.fields) {
    const expectedFieldLabel = `${prefix}.fields.${field.key}.fieldLabel`;
    if (field.label !== expectedFieldLabel) {
      errors.push({
        basename,
        message: `field "${field.key}" label "${field.label}" must be exactly "${expectedFieldLabel}"`,
      });
    }
    if (field.kind === 'radio' || field.kind === 'select') {
      for (const option of field.options) {
        const expectedOptionLabel = `${prefix}.fields.${field.key}.options.${option.value}`;
        if (option.label !== expectedOptionLabel) {
          errors.push({
            basename,
            message: `field "${field.key}" option "${option.value}" label "${option.label}" must be exactly "${expectedOptionLabel}"`,
          });
        }
      }
    }
  }

  return errors;
}

/**
 * Validates one theme's full set of new-block candidates. Deliberately
 * does NOT check for a type collision against core block types — that
 * requires knowing the full core registry, which only
 * `resolve-theme-page-blocks.ts` (in apps/public-site) has; this stays
 * core-agnostic so `@kometio/block-sdk` keeps its narrow dependency graph
 * (docs/adr/0037).
 */
export function validateThemeBlockSet(
  candidates: ThemeBlockCandidate[],
): ThemeBlockValidationError[] {
  const errors: ThemeBlockValidationError[] = [];

  for (const candidate of candidates) {
    const { basename, descriptor, hasRenderComponent, locales } = candidate;

    if (descriptor.type !== basename) {
      errors.push({
        basename,
        message: `filename "${basename}.block.ts" must match its own type "${descriptor.type}" exactly`,
      });
    }

    if (!hasRenderComponent) {
      errors.push({
        basename,
        message: `no matching "${basename}.astro" render component found`,
      });
    }

    if (
      !(KNOWN_CATEGORIES as readonly string[]).includes(descriptor.category)
    ) {
      errors.push({
        basename,
        message: `category "${descriptor.category}" is not one of: ${KNOWN_CATEGORIES.join(', ')}`,
      });
    }

    // `kind: 'custom'` is allowed for theme blocks (opened 2026-09-07): a
    // descriptor names its control rather than holding a React component,
    // so it survives the wire to editor-app like any other field. What is
    // NOT allowed is naming a control the editor has never heard of —
    // that renders as a blank space under a label, with nothing anywhere
    // to say why, so it is caught at build time and named here.
    for (const field of descriptor.fields) {
      if (
        field.kind === 'custom' &&
        !(CUSTOM_FIELD_CONTROLS as readonly string[]).includes(field.control)
      ) {
        errors.push({
          basename,
          message: `field "${field.key}" asks for control "${field.control}", which the editor cannot render — one of: ${CUSTOM_FIELD_CONTROLS.join(', ')}`,
        });
      }
    }

    errors.push(...labelKeyIssues(basename, descriptor));

    if (!locales) {
      errors.push({
        basename,
        message: `no matching "${basename}.locales.json" found`,
      });
    } else {
      for (const localeName of ['en', 'it'] as const) {
        const fragment = locales[localeName];
        if (!fragment) {
          errors.push({
            basename,
            message: `locales.json is missing "${localeName}"`,
          });
          continue;
        }
        if (typeof fragment.label !== 'string' || fragment.label.length === 0) {
          errors.push({
            basename,
            message: `${localeName}: missing top-level "label"`,
          });
        }
        for (const field of descriptor.fields) {
          errors.push(
            ...fieldLabelIssues(
              basename,
              localeName,
              field,
              fragment.fields?.[field.key],
            ),
          );
        }
      }
    }

    const stylable = descriptor.stylableProperties ?? [];
    const defaultStyleKeys = Object.keys(descriptor.defaultStyle ?? {});
    if (stylable.length > 0 || defaultStyleKeys.length > 0) {
      const stylableSorted = [...stylable].sort();
      const defaultStyleSorted = [...defaultStyleKeys].sort();
      const matches =
        stylableSorted.length === defaultStyleSorted.length &&
        stylableSorted.every((key, i) => key === defaultStyleSorted[i]);
      if (!matches) {
        errors.push({
          basename,
          message: `stylableProperties [${stylableSorted.join(', ')}] does not match defaultStyle keys [${defaultStyleSorted.join(', ')}]`,
        });
      }
    }
  }

  return errors;
}
