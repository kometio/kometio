import type {
  BlockStyleDefaults,
  BlockStyleOverride,
  CustomFieldControl,
} from '@kometio/shared-types';

export type { CustomFieldControl };

/** What a `showWhen` may compare against — a prop value the editor can hold, not an expression. */
export type FieldConditionValue = string | number | boolean;

/**
 * When a field is worth showing at all (ADR-0062).
 *
 * Deliberately one comparison against ONE sibling prop, not a predicate
 * and not a boolean algebra: the descriptor has to survive JSON so a
 * theme can declare a conditional field too (ADR-0048's additive rule),
 * and a function does not. Every case the registry actually has is of
 * this shape — `url` only when the link points at a url, `alt` only when
 * the image is not decorative — so a richer language would be inventing
 * needs rather than answering them.
 *
 * An absent prop counts as `false`, which is what makes
 * `{ field: 'isDecorative', equals: false }` correct on a block whose
 * props were saved before the flag existed.
 */
export interface FieldCondition {
  /** The key of a sibling prop on the SAME block — never another block's. */
  field: string;
  /** Shown when that prop equals this value, or any one of these. */
  equals: FieldConditionValue | readonly FieldConditionValue[];
}

/**
 * Which part of the inspector a field belongs to (ADR-0062).
 *
 * `content` is what the block SAYS, `style` what it LOOKS like, and
 * `advanced` what most people never need to touch — the split a person
 * already makes when they look at a panel of fourteen inputs and try to
 * find the one they came for. Absent = `content`, so every field written
 * before this existed lands where it always was.
 */
export type FieldGroup = 'content' | 'style' | 'advanced';

/** Every field carries these, whatever control draws it. */
interface FieldCommon {
  key: string;
  label: string;
  /** See `FieldCondition` — absent means always shown. */
  showWhen?: FieldCondition;
  /** See `FieldGroup` — absent means `content`. */
  group?: FieldGroup;
  /**
   * Shows a required marker and an inline warning while the field is
   * empty — a soft nudge, never a save/publish blocker.
   *
   * On every kind, not only the textual ones, since ADR-0063: the field
   * that needed it was the page picker, a `custom` field. A block whose
   * `linkType` says "Site page" and has no page picked is not a link at
   * all, and before the panel said so the only symptom was a button that
   * quietly did nothing. Meaningless on `boolean` (an unticked box is an
   * answer) and on `radio`/`select` with a default, so it is simply not
   * declared there.
   */
  required?: boolean;
}

/**
 * The three free-text kinds. They differ only in what draws them and what
 * the value means (a literal string, a multi-line one, sanitised HTML) —
 * everything else about them is the same, and was written out three times
 * before it was named.
 */
interface TextualField extends FieldCommon {
  inlineEditable?: boolean;
  placeholder?: string;
  /** Name of a sibling boolean prop that, when true, waives `required` — e.g. an "isDecorative" flag legitimately making an empty value correct, not an oversight. */
  requiredUnless?: string;
  /**
   * Where the value comes from while this one is empty: a dotted path into
   * the block's own props (an image's `alt` is the picked file's own
   * alternative text, `media.alt`). The renderer applies it; the editor
   * reads it only to know that an empty value here is not an oversight.
   */
  fallbackFrom?: string;
  /**
   * Opt-in, explicit — never derived from `inlineEditable` or `kind`.
   * A field can be free text without being locale-specific content
   * (e.g. an external URL typed via `kind: 'text'`), and conversely can
   * be translatable without being inline-editable (e.g. an image `alt`
   * attribute rather than a visible canvas node) — neither existing
   * flag is a reliable proxy, so this is its own field. `false`/absent
   * = the value lives on the shared page-group structure, same for
   * every locale; `true` = per-locale override.
   */
  translatable?: boolean;
}

/**
 * The public block-authoring data contract — every first-party block in
 * `libs/block-registry/src/lib/blocks/*.block.ts` is defined against this
 * exact same type (re-exported there from here, see that lib's
 * `field-types.ts`), and `defineBlock()` below returns it. Lives in
 * `block-sdk`, not `block-registry`, so a third-party block author only
 * needs this package — not the internal lib that also happens to contain
 * every core block's implementation.
 */
export type FieldDescriptor =
  | (TextualField & { kind: 'text' })
  | (TextualField & { kind: 'textarea' })
  | (TextualField & {
      /**
       * Long text that may carry formatting and, above all, a link INSIDE
       * a sentence (ADR-0046). The value is an HTML string, sanitised on
       * write against a strict allowlist (`@kometio/rich-text`), so a
       * renderer can trust it and use `set:html`.
       *
       * A string and not a document tree on purpose: the per-locale
       * translation overlay (`fieldValueOverlaySchema`) maps a field to a
       * STRING, so keeping it one means translating rich text works on
       * the day this ships, with no change to translation at all.
       *
       * `textarea` stays for content that is literal by definition —
       * `Code.code`, `EmbedHtml.html` — where formatting would corrupt
       * the value rather than enrich it.
       */
      kind: 'richtext';
    })
  | (FieldCommon & {
      kind: 'radio' | 'select';
      options: { label: string; value: string }[];
    })
  | (FieldCommon & {
      kind: 'number';
      min?: number;
      max?: number;
      step?: number;
      /**
       * Whether clearing the field means "no value" rather than zero
       * (ADR-0050).
       *
       * Without it an empty numeric input saves `0`, which for a property
       * whose range starts at 1 is not a number the user chose — it is a
       * value that fails the block's own schema while looking deliberate.
       * A column's width is the case that needed it: empty means "share
       * the room with the others", and there has to be a way back to it
       * after picking a number.
       *
       * Off by default, so every existing numeric field keeps behaving
       * exactly as it did.
       */
      optional?: boolean;
    })
  | (FieldCommon & { kind: 'boolean' })
  | (FieldCommon & {
      kind: 'custom';
      /**
       * WHICH editor control renders this field, by name — not the
       * component itself.
       *
       * It used to be a live `ComponentType`, and that one property
       * decided a surprising amount: a descriptor holding a React
       * component is not data, so the whole registry could only be read
       * by something that runs React. The API could not look at a
       * descriptor to find out which fields hold rich text
       * (ADR-0046) without pulling React into a Node server, and a theme
       * could not declare a custom field at all, because the value
       * cannot survive JSON — a limitation `themeFieldDescriptorSchema`
       * had to write down rather than solve.
       *
       * A name crosses every one of those boundaries. The editor keeps
       * the map from name to component, which is where the React
       * belongs; everything else reads the descriptor as what it is.
       */
      control: CustomFieldControl;
    });

/**
 * Whether a field is worth drawing, given the props the block currently
 * holds. Lives here, next to the type it reads, so the editor and
 * anything else that walks a descriptor answer the question the same way.
 */
export function isFieldVisible(
  field: FieldDescriptor,
  props: Record<string, unknown>,
): boolean {
  const condition = field.showWhen;
  if (!condition) return true;
  // An absent prop is `false`, not "no answer": a block saved before the
  // flag existed must behave like one whose flag is off, or the field it
  // guards would vanish from every page that predates it.
  const actual = props[condition.field] ?? false;
  const expected = condition.equals;
  return Array.isArray(expected)
    ? expected.some((value) => value === actual)
    : expected === actual;
}

/**
 * Kept as the way to declare a custom field, though it no longer has
 * anything to hide: it used to exist for a cast, because each concrete
 * picker typed `value`/`onChange` to its own domain while
 * `FieldDescriptor[]` had to stay homogeneous. Naming the control instead
 * of holding the component removed the mismatch rather than concentrating
 * it, so the generic and the cast are both gone.
 */
export class FieldBuilder {
  static custom(
    key: string,
    label: string,
    control: CustomFieldControl,
    /** Everything a custom field shares with the others — its group, when it shows, whether it is required. */
    options?: Pick<FieldCommon, 'showWhen' | 'group' | 'required'>,
  ): FieldDescriptor {
    return { kind: 'custom', key, label, control, ...options };
  }
}

/**
 * A style property a block offers: one core ships, or one a THEME added
 * (ADR-0047's consequence on `stylableProperties`).
 *
 * `string & {}` rather than a plain `string`, which would collapse the
 * union and lose autocomplete on the twenty-one core names. `Extract`
 * because the override schema has a catchall, which widens its `keyof` to
 * include `number` — a property name never is one — the point is
 * to keep those suggested while not making core the only possible source
 * of properties, which is what contradicted ADR-0037 and ADR-0041.
 */
export type BlockStylePropertyName =
  Extract<keyof BlockStyleOverride, string> | (string & {});

export interface BlockDescriptor<Props = Record<string, unknown>> {
  type: string;
  label: string;
  category: string;
  /**
   * The picture the editor shows for this type, as a lucide icon name in
   * kebab-case (`layout-panel-top`, `quote`, `image`).
   *
   * A name and not a component, for the same reason `CustomFieldControl`
   * is a name: a descriptor has to survive JSON so a THEME can declare a
   * block too, and a React component does not. The editor keeps the map
   * from name to component, which is where the React belongs.
   *
   * Optional so a block without one still registers — it falls back to a
   * neutral placeholder rather than refusing to appear. A test keeps the
   * core registry at 100%: an inserter of tiles where some tiles have no
   * picture is worse than a list.
   */
  icon?: string;
  defaultProps: Props;
  fields: FieldDescriptor[];
  /** `Block.children` is real (no Puck-style "slot" mapper needed) — present only on blocks that can contain other blocks. */
  isContainer?: boolean;
  /** No list = any registered block can go inside (e.g. Column/Container). */
  allowedChildTypes?: string[];
  /**
   * The only containers this block may sit in — for a block that does not
   * work outside its parent. A Tab is a panel whose label becomes a button
   * only inside Tabs; at the page root it rendered as bare content with no
   * way to reach it.
   *
   * No list = anywhere a container accepts it, the page root included. The
   * other side of `allowedChildTypes`: that one is the parent saying what
   * it takes, this one is the child saying where it belongs, and a
   * placement has to satisfy both.
   */
  allowedParentTypes?: string[];
  /**
   * What this container draws depends on its children's PROPS, not only on
   * the children being there: a FAQ's structured data is made of its
   * questions, a glossary's A–Z index of its terms, a playlist's list of
   * its videos' captions, a row of columns of its columns' widths.
   *
   * The canvas re-renders only the block that was edited, so without this
   * an edited child left its parent saying the old thing — a glossary term
   * renamed from "Beta" to "Zeta" still listed under B. With it, editing a
   * child re-renders the parent, children included, the way inserting one
   * already does. `block-renderer-children.spec.ts` in apps/public-site
   * holds this flag to what BlockRenderer actually reads.
   */
  rendersFromChildren?: boolean;
  /**
   * Which shared style properties (docs/adr/0022) make sense for this
   * type — not every block uses every property (Text has no sensible
   * "border radius"). Absent/empty = no "Style" button or per-instance
   * override popover for this type: rollout is incremental, not a
   * mechanical addition to every block type at once (see the ADR for why).
   */
  stylableProperties?: readonly BlockStylePropertyName[];
  /**
   * The default CSS expression for each of this type's `stylableProperties`
   * — e.g. `{ borderRadius: 'var(--radius)', paddingX: '1.25rem' }` —
   * copied 1:1 from the fallback its `.astro` component already uses (e.g.
   * `var(--kometio-override-radius, var(--radius))`), not invented: this is
   * the same source of truth, just declared here instead of staying
   * visible only inside a CSS file. A reference to a theme custom property
   * (`var(--x)`) is resolved against the active theme's `theme.css` by
   * `apps/public-site/src/lib/resolve-theme-block-style-defaults.ts` before
   * reaching the editor — a literal (e.g. `'transparent'`, `'0.5rem'`)
   * passes through unchanged. Present only when `stylableProperties` is
   * non-empty, with the same keys.
   */
  defaultStyle?: BlockStyleDefaults;
  /**
   * The named looks this block type offers, picked from a menu in the
   * editor (ADR-0047). Absent/empty = the type has one look and no
   * picker appears.
   *
   * Enumerated and not free text, which is the whole reason the primitive
   * is a "variant" rather than a class: a class is a developer's tool, a
   * variant is a product concept the client can also use without being
   * able to invent nonsense. It is also the shape design actually arrives
   * in — a Figma component with twenty button variants.
   *
   * The chosen value lives on `Block.variant`, NOT in props: props are
   * the client's content and a theme is a view over it (ADR-0048), so a
   * theme may add variants here or hide one it has no design for without
   * touching a single stored page.
   *
   * `value` becomes part of a CSS class (`.kometio-button--secondary`), so
   * it must satisfy `blockVariantNameSchema`; `label` is an i18n key like
   * every other label here.
   */
  variants?: readonly { value: string; label: string }[];
}
