import type { ExposedFields } from '@kometio/shared-types';

/**
 * The per-BLOCK slice of the section editor's expose controls. A function
 * rather than an inline object so the "no block id" case is answered once:
 * a block without an id cannot be keyed in `exposedFields` at all, and
 * offering the checkbox anyway would silently drop the choice.
 */
export function buildSectionEditing(
  sectionEditing:
    | {
        exposedFields: ExposedFields;
        onToggleField: (blockId: string, field: string) => void;
      }
    | undefined,
  blockId: string | undefined,
): { exposed: string[]; onToggle: (field: string) => void } | undefined {
  if (!sectionEditing || !blockId) {
    return undefined;
  }
  return {
    exposed: sectionEditing.exposedFields[blockId] ?? [],
    onToggle: (field: string) => sectionEditing.onToggleField(blockId, field),
  };
}
