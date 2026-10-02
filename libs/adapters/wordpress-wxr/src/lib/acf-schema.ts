import type {
  AcfField,
  AcfFieldGroup,
  AcfSchema,
  AcfTarget,
} from '@kometio/ports';
import type { WxrItem } from './read-wxr';
import { phpArray, phpString, phpUnserialize } from './php-unserialize';

const LOCATION_KINDS: Record<string, AcfTarget['kind']> = {
  block: 'block',
  post_type: 'postType',
  taxonomy: 'taxonomy',
  options_page: 'optionsPage',
};

interface RawField {
  postId: number;
  parentId: number;
  key: string;
  name: string;
  label: string;
  type: string;
  order: number;
}

/**
 * Builds the shape of a site's custom fields out of its own export.
 *
 * This is what makes an import work on a site nobody has seen. A value
 * like `"left"` or `"Chi siamo"` says nothing about what it is; the
 * definition says it is a `select` or a `text`, what it is called, and
 * what it sits inside. WordPress exports all of it — on the first client
 * site measured, 33 groups and 557 fields — so the shape never has to be
 * guessed or configured.
 *
 * Fed one item at a time, because the export it reads from is hundreds of
 * megabytes and is read as a stream.
 *
 * Where ACF keeps each part, which is not where you would expect: the
 * field's **name** is in `post_excerpt`, its label is the title, its key
 * is the slug, and everything else is PHP-serialised in the content. A
 * sub-field is its own row, pointing at its parent with `post_parent`.
 */
export class AcfSchemaReader {
  private readonly fields: RawField[] = [];
  private readonly groups = new Map<
    number,
    { title: string; targets: AcfTarget[] }
  >();

  /** Feed every item; the ones that are not ACF are ignored. */
  accept(item: WxrItem): void {
    if (item.postType === 'acf-field-group') {
      if (item.postId === null) return;
      this.groups.set(item.postId, {
        title: item.title,
        targets: readTargets(item.content),
      });
      return;
    }
    if (item.postType !== 'acf-field' || item.postId === null) return;

    let type = '';
    try {
      type = phpString(phpUnserialize(item.content), 'type');
    } catch {
      // A definition this cannot read is a field of unknown type rather
      // than a reason to abandon the export — it will be reported as
      // unconvertible, which is the truth about it.
      type = '';
    }
    this.fields.push({
      postId: item.postId,
      parentId: item.parentId ?? 0,
      key: item.slug,
      // `post_excerpt`, genuinely: the label is the title and the key is
      // the slug, which leaves the name nowhere else to go.
      name: item.excerpt.trim(),
      label: item.title,
      type,
      order: item.menuOrder,
    });
  }

  build(): AcfSchema {
    const byParent = new Map<number, RawField[]>();
    for (const field of this.fields) {
      const siblings = byParent.get(field.parentId) ?? [];
      siblings.push(field);
      byParent.set(field.parentId, siblings);
    }
    for (const siblings of byParent.values()) {
      siblings.sort((a, b) => a.order - b.order);
    }

    const toTree = (field: RawField, depth: number): AcfField => ({
      key: field.key,
      name: field.name,
      label: field.label,
      type: field.type,
      // Bounded: a field pointing at itself, directly or round a ring,
      // would otherwise be an export that hangs the server reading it.
      children:
        depth >= 10
          ? []
          : (byParent.get(field.postId) ?? []).map((child) =>
              toTree(child, depth + 1),
            ),
    });

    const groups: AcfFieldGroup[] = [];
    for (const [postId, group] of this.groups) {
      groups.push({
        title: group.title,
        targets: group.targets,
        fields: (byParent.get(postId) ?? []).map((field) => toTree(field, 0)),
      });
    }

    const collect = (kind: AcfTarget['kind'], value: string): AcfField[] =>
      groups
        .filter((group) =>
          group.targets.some(
            (target) => target.kind === kind && target.value === value,
          ),
        )
        .flatMap((group) => group.fields);

    return {
      groups,
      forBlock: (blockName) => collect('block', blockName),
      forPostType: (postType) => collect('postType', postType),
    };
  }
}

/**
 * The `location` rules, flattened.
 *
 * ACF nests them two deep — an OR of ANDs — and what matters here is only
 * which things the group describes, so the nesting is dropped. A group
 * shown on two blocks describes both.
 */
function readTargets(content: string): AcfTarget[] {
  let definition;
  try {
    definition = phpUnserialize(content);
  } catch {
    return [];
  }
  const location = phpArray(definition, 'location');
  if (!location) return [];

  const targets: AcfTarget[] = [];
  for (const [, group] of location) {
    if (!(group instanceof Map)) continue;
    for (const [, rule] of group) {
      const param = phpString(rule, 'param');
      const value = phpString(rule, 'value');
      // `!=` says where the group does NOT apply, which describes nothing.
      if (value === '' || phpString(rule, 'operator') !== '==') continue;
      targets.push({ kind: LOCATION_KINDS[param] ?? 'other', value });
    }
  }
  return targets;
}
