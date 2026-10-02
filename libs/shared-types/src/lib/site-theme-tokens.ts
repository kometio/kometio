import { z } from 'zod';

/**
 * A raw CSS length value ("6px", "0.5rem", "9999px" for a pill) — with no
 * unit imposed: letting the user pick px/rem/% rather than forcing one unit
 * is closer to how the CSS var it feeds downstream works (see
 * PageLayout.astro). `null` = not customized, inheriting the active theme's
 * default.
 */
/**
 * What may not appear in a value that is written straight into a
 * stylesheet.
 *
 * These values reach the page through `buildBlockStyleOverridesCss`, which
 * interpolates them into a `<style>` — so `red; } body { … } .x {` used to
 * close our rule and open one of the attacker's own, covering the whole
 * site. Demonstrated, not theorised: the string above produced a valid
 * full-page overlay. Anyone with edit rights could do it, against a site
 * they do not own.
 *
 * Characters, not syntax, because a CSS grammar strict enough to be safe
 * would also refuse values people legitimately write. Everything that can
 * end a declaration or start a rule is out — `;` `{` `}` `@` `<` `>` — and
 * with them gone, what remains cannot escape the declaration it is in.
 * `\` goes too, or `\3B` smuggles a semicolon back in; comment markers go
 * because they could swallow the closing brace and merge two rules.
 *
 * What stays allowed is everything real: `#fff`, `oklch(0.7 0.1 250)`,
 * `rgb(0 0 0 / 50%)`, `var(--primary)`, `calc(100% - 2rem)`, `1.5rem`.
 */
const CSS_VALUE_BREAKOUT = /[;{}@<>\\]|\/\*|\*\//;
const MAX_CSS_VALUE_LENGTH = 200;

const cssValueSchema = z
  .string()
  .min(1)
  .max(MAX_CSS_VALUE_LENGTH)
  .refine((value) => !CSS_VALUE_BREAKOUT.test(value), {
    message:
      'must be a plain CSS value: ; { } @ < > \\ and comment markers are not allowed',
  });

export const cssLengthTokenSchema = cssValueSchema.nullable();

const CSS_LENGTH_UNITS =
  'px|rem|em|%|vw|vh|vmin|vmax|svw|svh|dvw|dvh|lvw|lvh|ch|ex|cap|lh|rlh|cm|mm|q|in|pt|pc';
const CSS_NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)`;
const PLAIN_CSS_LENGTH = new RegExp(
  `^(?:${CSS_NUMBER}(?:${CSS_LENGTH_UNITS})|0)$`,
  'i',
);
/** A length computed by the browser: whatever is inside is left to it, but it has to be one of these and close its bracket. */
const COMPUTED_CSS_LENGTH =
  /^(?:calc|min|max|clamp)\((?:[^()]|\([^()]*\))+\)$/i;

/**
 * Whether `value` is something a width can be: a number with a unit
 * (`64rem`, `1100px`, `80%`), a bare `0`, or a `calc()` / `min()` / `max()`
 * / `clamp()` of them.
 *
 * `cssLengthTokenSchema` only keeps a value from breaking out of its
 * declaration — it lets "banana" through, and "banana" written into a
 * stylesheet is a rule the browser throws away without a word: the setting
 * looks saved and does nothing. This is the question a form asks before it
 * lets the value go.
 */
export function isCssLength(value: string): boolean {
  const trimmed = value.trim();
  return (
    cssLengthTokenSchema.safeParse(trimmed).success &&
    (PLAIN_CSS_LENGTH.test(trimmed) || COMPUTED_CSS_LENGTH.test(trimmed))
  );
}

/**
 * What a width may be when it is saved: `isCssLength`, or `null` for "not
 * customised". The write-side counterpart of `cssLengthTokenSchema`, which is
 * kept lenient for reading — a value stored before this rule existed must
 * not make a site unreadable, only unsavable.
 */
export const cssLengthSchema = cssLengthTokenSchema.refine(
  (value) => value === null || isCssLength(value),
  { message: 'must be a CSS length such as 64rem, 1100px or 80%' },
);

/** A raw CSS colour (any valid syntax — hex, oklch, var(...)). `null` = not customised. */
export const cssColorTokenSchema = cssValueSchema.nullable();

/**
 * A time, and nothing else (docs/adr/0060). Narrower than
 * `cssLengthTokenSchema` on purpose: a duration is the one place where a
 * wrong unit is not a wrong look but a broken animation — `600` without
 * `ms` makes the whole `animation` shorthand invalid, and the block simply
 * never appears. Four seconds is the ceiling because an entrance animation
 * longer than that is a page that looks broken.
 */
export const cssDurationTokenSchema = z
  .string()
  .regex(
    /^(?:[0-9]|[1-9][0-9]{0,3})(?:\.[0-9]{1,3})?m?s$/,
    'must be a CSS duration like "600ms" or "0.6s"',
  )
  .refine(
    (value) =>
      (value.endsWith('ms')
        ? Number(value.slice(0, -2))
        : Number(value.slice(0, -1)) * 1000) <= 4000,
    { message: 'must be at most 4s' },
  )
  .nullable();

/**
 * Closed sets, so the editor can render a menu rather than a text box and
 * the value is safe in CSS by construction — there is nothing to escape
 * in `dashed`.
 */
export const borderStyleSchema = z
  .enum(['solid', 'dashed', 'dotted', 'none'])
  .nullable();
export const backgroundPositionSchema = z
  .enum(['center', 'top', 'bottom', 'left', 'right'])
  .nullable();
export const backgroundSizeSchema = z
  .enum(['cover', 'contain', 'auto'])
  .nullable();

/**
 * How a block arrives when it first scrolls into view (docs/adr/0060).
 *
 * A closed list and not a free CSS `animation` value, unlike `boxShadow`
 * just below: an entrance animation is a keyframe set the stylesheet has
 * to define, so an arbitrary string could only name something that does
 * not exist. Every one of these moves opacity and transform ONLY —
 * nothing that changes layout — because an entrance animation that moved
 * a margin or a height would push the rest of the page around while it
 * played, which is a Cumulative Layout Shift on a site's most visible
 * content.
 */
export const blockAnimationSchema = z
  .enum([
    'none',
    'fade',
    'slide-up',
    'slide-down',
    'slide-left',
    'slide-right',
    'zoom',
  ])
  .nullable();

/** What a block does under the pointer. Same closed-list reasoning as `blockAnimationSchema`. */
export const blockHoverEffectSchema = z
  .enum(['none', 'lift', 'grow', 'dim'])
  .nullable();

/**
 * `ease-out` is the default rather than `ease` or `linear`: an element
 * entering the viewport should decelerate into place, which is what makes
 * an entrance read as arriving rather than as being dragged.
 */
export const animationEasingSchema = z
  .enum(['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear'])
  .nullable();
export const backgroundRepeatSchema = z
  .enum(['no-repeat', 'repeat', 'repeat-x', 'repeat-y'])
  .nullable();
/** Start/center/end rather than left/right: it reads the same on a right-to-left site (ADR-0099's `dir` work). */
export const contentAlignSchema = z.enum(['start', 'center', 'end']).nullable();
/**
 * Whether a container stacks its children or lines them up (ADR-0050).
 *
 * A closed set for the same reason as every enum above — there is nothing
 * to escape in `row` — and a style property rather than a block prop so it
 * can differ per breakpoint: a row of three cards on a desktop and a stack
 * on a phone is the single most common responsive layout there is, and
 * until now a Container could only ever be a column.
 */
export const flexDirectionSchema = z.enum(['column', 'row']).nullable();

/**
 * The style properties a block can make overridable — ONE shape shared by
 * every block type (docs/adr/0022), not a Zod field added by hand to each
 * of the 48+ types: not every block uses every property (a Text has no
 * sensible "border radius"), and it is
 * `BlockDescriptor.stylableProperties` that declares which of these are
 * actually relevant to a given type.
 */
/**
 * The key of a style property a THEME adds to a block (ADR-0047's
 * consequence on `stylableProperties`), as opposed to one of the ones
 * core ships.
 *
 * It becomes a CSS custom property name — `letterSpacing` emits
 * `--kometio-override-letter-spacing` — so it is checked like every other
 * value that reaches a stylesheet (PR #144). Derived rather than declared
 * by the theme, deliberately: a theme naming its own variable could point
 * two properties at one name, or collide with a core one, and neither
 * mistake announces itself.
 */
export const themeStylePropertyKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][A-Za-z0-9]*$/, 'must be a style property name');

/** The property names core itself ships — everything else in an override came from a theme (ADR-0047). A map rather than a Set so the check above is a plain `in`. */
const BLOCK_STYLE_PROPERTY_KEYS: Readonly<Record<string, true>> = {
  backgroundColor: true,
  textColor: true,
  borderRadius: true,
  paddingX: true,
  paddingY: true,
  marginTop: true,
  marginBottom: true,
  animation: true,
  animationDuration: true,
  animationDelay: true,
  animationEasing: true,
  hoverEffect: true,
  borderWidth: true,
  borderStyle: true,
  borderColor: true,
  boxShadow: true,
  backgroundImage: true,
  backgroundPosition: true,
  backgroundSize: true,
  backgroundRepeat: true,
  overlayColor: true,
  minHeight: true,
  maxWidth: true,
  gap: true,
  contentAlign: true,
  contentJustify: true,
  flexDirection: true,
};

export const blockStyleOverrideSchema = z
  .object({
    backgroundColor: cssColorTokenSchema.optional(),
    textColor: cssColorTokenSchema.optional(),
    borderRadius: cssLengthTokenSchema.optional(),
    paddingX: cssLengthTokenSchema.optional(),
    paddingY: cssLengthTokenSchema.optional(),
    // Unlike the other properties above, these two are deliberately EXCLUDED
    // from BLOCK_STYLE_CUSTOM_PROPERTIES (block-style-overrides.ts) — they
    // make no sense as a per-TYPE CSS rule scoped by `.kometio-<type>` (it
    // would touch every instance of that type anywhere, including ones nested
    // inside a Container/Columns, where the space between siblings is already
    // handled by the container's gap). They are applied per-instance instead,
    // and only for a top-level block of the page (PublicPageContent.astro) —
    // see editor-app's block-toolbar-overlay.tsx `isRootLevel` for the gate
    // on the editor side.
    marginTop: cssLengthTokenSchema.optional(),
    marginBottom: cssLengthTokenSchema.optional(),

    /*
     * The animation set (docs/adr/0060). Instance-only and root-block-only
     * for the margins' reason above, plus one of its own: the animated
     * element is the WRAPPER around a root block, which is the only
     * element that exists once per placement. A per-TYPE entrance
     * animation would fire on every block of that type anywhere, including
     * the six inside a Columns that are already arriving with their
     * parent.
     */
    animation: blockAnimationSchema.optional(),
    animationDuration: cssDurationTokenSchema.optional(),
    animationDelay: cssDurationTokenSchema.optional(),
    animationEasing: animationEasingSchema.optional(),
    /** Under the pointer. Instance-only for the same reason as the four above. */
    hoverEffect: blockHoverEffectSchema.optional(),

    // --- The vocabulary an ordinary marketing page needs (ADR-0047) ---
    //
    // Seven properties could not express a website: no border, no shadow,
    // no background IMAGE, no overlay, no minimum height, no alignment, no
    // maximum width, no gap. Everything below closes that, and a block
    // still only offers what its own `stylableProperties` declares — so
    // adding a property here does not put a control on every block.

    borderWidth: cssLengthTokenSchema.optional(),
    borderStyle: borderStyleSchema.optional(),
    borderColor: cssColorTokenSchema.optional(),

    /**
     * Usually `var(--shadow-md)` from the theme's own scale, which is what
     * keeps a site coherent — change the scale and every shadow follows.
     * A literal value is allowed too, because a design handed over as a
     * Figma file sometimes has to be matched exactly, and closing that door
     * only pushes the work into the site's custom CSS, where the system
     * cannot see it at all.
     */
    boxShadow: cssValueSchema.nullable().optional(),

    /**
     * A `url(...)`, or a gradient — anything that is a valid
     * `background-image`. Stored as the CSS value rather than a media
     * reference so it stays a scalar like every other property here; the
     * editor's control fills it in from the media picker.
     */
    backgroundImage: cssValueSchema.nullable().optional(),
    backgroundPosition: backgroundPositionSchema.optional(),
    backgroundSize: backgroundSizeSchema.optional(),
    backgroundRepeat: backgroundRepeatSchema.optional(),

    /**
     * The wash between a background image and the text on top of it,
     * without which light photographs make body copy unreadable.
     *
     * One property, not colour plus opacity: CSS already expresses "black
     * at 50%" as `rgb(0 0 0 / 50%)`, and a second knob would be a second
     * thing to keep in step for no expressive gain.
     */
    overlayColor: cssColorTokenSchema.optional(),

    minHeight: cssLengthTokenSchema.optional(),
    maxWidth: cssLengthTokenSchema.optional(),
    gap: cssLengthTokenSchema.optional(),

    /** Horizontal placement of the block's own content. */
    contentAlign: contentAlignSchema.optional(),
    /** Vertical placement — what a hero with a minimum height needs, and nothing else can express. */
    contentJustify: contentAlignSchema.optional(),
    /** Stack the children or line them up — see `flexDirectionSchema`. */
    flexDirection: flexDirectionSchema.optional(),
  })
  /**
   * Plus whatever a THEME added (ADR-0047). A closed object here would
   * mean core is the only possible source of style properties, which
   * contradicts ADR-0037 and ADR-0041 — a theme could restyle a block but
   * never give the agency a knob for something core did not think of.
   *
   * `catchall`, not `passthrough`: an unknown key still has to be a
   * usable property name and its value still has to survive
   * `cssValueSchema`, so the two barriers PR #144 established hold for a
   * theme's properties exactly as they do for core's. What is NOT checked
   * here is that some theme actually declared the key — that is the
   * editor's business, and the emitter treats an undeclared one as
   * harmless: it becomes a custom property nobody reads.
   */
  .catchall(cssValueSchema.nullable().optional())
  // `catchall` constrains the VALUE of an unknown key and says nothing
  // about the key itself, so `{ 'letter spacing': '1px' }` parses without
  // this. The key becomes a CSS custom property name, so it is refused
  // where it is written as well as where it is emitted — the two-barrier
  // shape PR #144 established, not one or the other.
  .superRefine((override, ctx) => {
    for (const key of Object.keys(override)) {
      if (key in BLOCK_STYLE_PROPERTY_KEYS) {
        continue;
      }
      if (!themeStylePropertyKeySchema.safeParse(key).success) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `"${key}" is not a usable style property name — it becomes a CSS custom property`,
        });
      }
    }
  });
export type BlockStyleOverride = z.infer<typeof blockStyleOverrideSchema>;

/**
 * The "component-level" override (docs/adr/0022) — it replaces the old
 * fixed `{ buttons: {...} }` shape with a generic map keyed by block type:
 * any type can receive an override without needing a new dedicated Zod
 * field each time. Applied to ALL instances of that type across the site —
 * see `Block.styleOverride` for the single-instance override.
 */
/**
 * The sizes a style can differ at.
 *
 * Familiar words with the measurement beside them in the interface
 * (`Desktop (>1024px)`, `Tablet (<=1024px)`, `Mobile (<=768px)`), because
 * the words cost nothing to somebody arriving from another builder while
 * the numbers make it obvious that what is meant is a SIZE — which
 * matters here, since the size measured is the space the block has, not
 * the browser window (ADR-0047).
 */
export const BREAKPOINTS = ['base', 'tablet', 'mobile'] as const;
export type StyleBreakpoint = (typeof BREAKPOINTS)[number];

/** The widths the two narrow tiers answer to. `base` has none: it is what applies when neither matches. */
export const BREAKPOINT_MAX_WIDTHS: Record<
  Exclude<StyleBreakpoint, 'base'>,
  number
> = {
  tablet: 1024,
  mobile: 768,
};

/**
 * A style that can differ by size — breakpoint-major, because that is the
 * shape of the CSS it becomes: one block of declarations per query,
 * rather than every property carrying three values of its own.
 *
 * `base` always exists; the other two hold only what CHANGES there, so a
 * value set once keeps applying at every size, exactly as CSS already
 * behaves. Nothing has to be repeated to stay the same.
 */
export const responsiveBlockStyleSchema = z.preprocess(
  // The old shape is the new one with only `base` — a flat override
  // written before breakpoints existed still parses, and still means what
  // it meant. Detected by the presence of `base` rather than by trying
  // both shapes: `blockStyleOverrideSchema` would accept `{ base: … }` by
  // quietly ignoring the unknown key, and the value would vanish.
  (value) =>
    value !== null && typeof value === 'object' && 'base' in value
      ? value
      : { base: value ?? {} },
  z.object({
    base: blockStyleOverrideSchema,
    tablet: blockStyleOverrideSchema.optional(),
    mobile: blockStyleOverrideSchema.optional(),
  }),
);
export type ResponsiveBlockStyle = z.infer<typeof responsiveBlockStyleSchema>;

/**
 * A stored style, in whatever shape it is on disk, as the current one.
 *
 * The read boundary for `site_theme_block_styles.style` and for any block
 * override coming back from the database. Two things can be wrong with a
 * stored value and they deserve different answers:
 *
 * - the SHAPE is the old flat one, written before breakpoints existed.
 *   `responsiveBlockStyleSchema` already reads that as `{ base: … }`.
 * - a VALUE is one today's rules reject — a row written before the CSS
 *   injection fix (PR #144) bounded what a declaration may contain.
 *
 * A plain `.parse` answers both with an exception, which on this path
 * means a site that does not render because one block once had a bad
 * colour. So an invalid value costs that one property and nothing else:
 * every other property, and every other block, still comes back.
 */
export function normalizeResponsiveBlockStyle(
  value: unknown,
): ResponsiveBlockStyle {
  const parsed = responsiveBlockStyleSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  const buckets = responsiveBlockStyleSchema.safeParse(
    dropUnusableValues(value),
  );
  return buckets.success ? buckets.data : { base: {} };
}

/** Every field a `cssValueSchema` would refuse, removed — one bucket deep, which is as deep as this shape goes. */
function dropUnusableValues(value: unknown): unknown {
  const isRecord = (candidate: unknown): candidate is Record<string, unknown> =>
    typeof candidate === 'object' &&
    candidate !== null &&
    !Array.isArray(candidate);
  if (!isRecord(value)) {
    return {};
  }
  const keep = (bucket: unknown): Record<string, unknown> =>
    isRecord(bucket)
      ? Object.fromEntries(
          Object.entries(bucket).filter(
            ([, field]) =>
              field === null ||
              field === undefined ||
              cssValueSchema.safeParse(field).success,
          ),
        )
      : {};
  if (!('base' in value)) {
    return keep(value);
  }
  return Object.fromEntries(
    BREAKPOINTS.filter((breakpoint) => breakpoint in value).map(
      (breakpoint) => [breakpoint, keep(value[breakpoint])],
    ),
  );
}

/**
 * The same style with ONE breakpoint replaced.
 *
 * A breakpoint whose override is empty is dropped rather than stored as
 * `{}`: `base` is the only size that always exists, and the other two are
 * meant to hold what CHANGES. Keeping empty buckets would make "has this
 * block anything at mobile?" — the question an editor asks to mark the
 * control — answer yes for a block that merely had the mobile tab opened
 * once.
 */
export function withBreakpointStyle(
  style: ResponsiveBlockStyle | undefined,
  breakpoint: StyleBreakpoint,
  override: BlockStyleOverride,
): ResponsiveBlockStyle {
  const current: ResponsiveBlockStyle = style ?? { base: {} };
  if (breakpoint === 'base') {
    return { ...current, base: override };
  }
  const next = { ...current };
  if (Object.values(override).some((value) => value)) {
    next[breakpoint] = override;
  } else {
    delete next[breakpoint];
  }
  return next;
}

/**
 * A block type name, which becomes a CSS SELECTOR
 * (`blockTypeToClassName`), so it is constrained the same way a value is
 * — and for the same demonstrated reason: `X { } body { display: none } .y`
 * as a type produced exactly that rule in the page's stylesheet.
 *
 * Every real block type is a PascalCase identifier (`Hero`, `PromoBar`,
 * `EmbedHtml`), core and theme alike, so this refuses nothing legitimate.
 */
export const blockTypeNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9]*$/, 'must be a block type name');

/**
 * The key for "no variant" — the style of the block type itself.
 *
 * A reserved word rather than an empty string, which the database column
 * and the JSON both had to carry otherwise: `blockStyles.Button.default`
 * reads, `blockStyles.Button['']` does not, and an empty primary-key
 * component is the kind of thing that looks like a bug every time someone
 * meets it. `blockVariantNameSchema` refuses it as a declared variant, so
 * the two can never collide.
 */
export const DEFAULT_VARIANT = 'default';

/**
 * A variant name, which becomes part of a CSS SELECTOR
 * (`.kometio-button--secondary`), so it is constrained exactly like a block
 * type name and for the same demonstrated reason (PR #144: a value AND a
 * key both reached a public `<style>`).
 *
 * Today this refuses nothing, because every variant is declared in code
 * as a literal. It starts mattering the moment a theme — or the editor —
 * can add one, which is the point of ADR-0047's fourth decision: at that
 * moment the name stops being a literal and becomes data, and data that
 * reaches a selector is checked where it gets there, not only where it
 * was written.
 *
 * Lower case with dashes, because that is what a class name looks like
 * and a variant is picked from a menu, never typed into markup.
 */
export const blockVariantNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9-]*$/, 'must be a variant name')
  .refine((value) => value !== DEFAULT_VARIANT, {
    message: `"${DEFAULT_VARIANT}" is reserved for the block type's own style`,
  });

/** A key in the per-type style map: a declared variant, or the reserved word for the type's own look. */
export const blockVariantKeySchema = z.union([
  z.literal(DEFAULT_VARIANT),
  blockVariantNameSchema,
]);

export const themeTokensSchema = z.object({
  /**
   * The per-TYPE style tier (docs/adr/0022), keyed by type and then by
   * variant since ADR-0047 — so "every Button" and "every ghost Button"
   * are two different things an agency can paint, and today's per-type
   * style becomes the `default` variant's rather than a fourth tier.
   */
  blockStyles: z.record(
    blockTypeNameSchema,
    z.record(blockVariantKeySchema, responsiveBlockStyleSchema),
  ),
});
export type ThemeTokens = z.infer<typeof themeTokensSchema>;

/** No customized types — every block uses its own existing CSS defaults. */
export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  blockStyles: {},
};

/**
 * A per-type update (the `PATCH /sites/:id/theme-tokens` endpoint): the
 * body carries the complete override for ONE block type at a time (the
 * toolbar's "Style" button always edits the selected block's type) — it
 * replaces that map entry wholesale, leaving every other already-saved type
 * untouched.
 */
export const updateThemeTokensBodySchema = z.object({
  blockType: blockTypeNameSchema,
  /** Which look of that type is being painted. Absent = the type's own, which is what every client sent before ADR-0047. */
  variant: blockVariantKeySchema.default(DEFAULT_VARIANT),
  style: responsiveBlockStyleSchema,
});
export type UpdateThemeTokensBody = z.infer<typeof updateThemeTokensBodySchema>;

/**
 * The RESOLVED value (not a raw token) of every stylable property for a
 * block type, against the active theme — `borderRadius: "0.5rem"`, say,
 * never an unresolved `"var(--radius)"`. Unlike `BlockStyleOverride`, every
 * key present here ALWAYS has a string value: there is no "null default", a
 * stylable block always has some appearance when not customized, and that
 * appearance is what this type captures. Source:
 * `BlockDescriptor.defaultStyle` (block-registry, the declared expression,
 * e.g. `var(--primary)`) resolved against the active theme's `theme.css` —
 * see `apps/public-site/src/lib/resolve-theme-block-style-defaults.ts`.
 */
export const blockStyleDefaultsSchema = z.object({
  backgroundColor: z.string().min(1).optional(),
  textColor: z.string().min(1).optional(),
  borderRadius: z.string().min(1).optional(),
  paddingX: z.string().min(1).optional(),
  paddingY: z.string().min(1).optional(),
  // The widened vocabulary (ADR-0047) resolves the same way: a block
  // declares the theme expression it starts from, and the editor shows it
  // as the placeholder so a field reads "what this is now" rather than
  // being blank. Only the properties a block actually declares appear.
  borderWidth: z.string().min(1).optional(),
  borderStyle: z.string().min(1).optional(),
  borderColor: z.string().min(1).optional(),
  boxShadow: z.string().min(1).optional(),
  backgroundImage: z.string().min(1).optional(),
  backgroundPosition: z.string().min(1).optional(),
  backgroundSize: z.string().min(1).optional(),
  backgroundRepeat: z.string().min(1).optional(),
  overlayColor: z.string().min(1).optional(),
  minHeight: z.string().min(1).optional(),
  maxWidth: z.string().min(1).optional(),
  gap: z.string().min(1).optional(),
  contentAlign: z.string().min(1).optional(),
  contentJustify: z.string().min(1).optional(),
  flexDirection: z.string().min(1).optional(),
  // marginTop/marginBottom have no "theme default" to resolve (they depend
  // on no theme — see the comment on them in `blockStyleOverrideSchema`
  // above): these two fields always stay `undefined` here, never populated
  // by resolve-theme-block-style-defaults.ts. They are declared anyway to
  // keep the type aligned with `BlockStyleOverride` — the shared UI
  // (editor-app's block-style-fields.tsx) indexes `defaults` with
  // `keyof BlockStyleOverride`, and omitting them here would force that
  // code into a cast instead of a correct type.
  marginTop: z.string().min(1).optional(),
  marginBottom: z.string().min(1).optional(),
});
export type BlockStyleDefaults = z.infer<typeof blockStyleDefaultsSchema>;

/** Response body of `GET /api/themes/current/block-style-defaults` (apps/public-site): one entry per stylable block type. */
export const blockStyleDefaultsResponseSchema = z.record(
  z.string().min(1),
  blockStyleDefaultsSchema,
);
export type BlockStyleDefaultsResponse = z.infer<
  typeof blockStyleDefaultsResponseSchema
>;

/**
 * The response body of `GET /api/themes/current/foreground-tokens`
 * (apps/public-site) — the active theme's two root tokens
 * `--primary-foreground`/`--secondary-foreground`, resolved (not a raw
 * `var(--x)`). A separate endpoint from `block-style-defaults` above: those
 * two tokens are the default of NO stylable property declared for any block
 * type (only `Button`/`PromoBar` reference `--primary-foreground` in
 * passing, and `--secondary-foreground` nowhere) — they serve the WCAG
 * contrast check on the theme's own primary/secondary colour pickers
 * (GlobalStylesDialog) instead, not a block.
 */
export const themeForegroundTokensSchema = z.object({
  primaryForeground: z.string().min(1),
  secondaryForeground: z.string().min(1),
});
export type ThemeForegroundTokens = z.infer<typeof themeForegroundTokensSchema>;

/**
 * The response body of `GET /api/themes/current/base-tokens`
 * (apps/public-site) — the raw values the active theme's `theme.css`
 * declares for `--primary`/`--secondary`/`--font-sans-value`/`--radius`.
 * Unlike `themeForegroundTokensSchema` above (which only serves the
 * contrast check), these feed the starting values shown in
 * GlobalStylesDialog: before this endpoint, "no Tier 1 override set"
 * displayed a generic hardcoded fallback (`#18181b`) rather than the active
 * theme's real colour or font — a theme had no way of showing the editor
 * its own base values. Read-only: the editor never writes these fields,
 * they are a starting point rather than an override (that stays
 * `site.themePrimaryColor` and friends).
 */
export const themeBaseTokensSchema = z.object({
  primary: z.string().min(1),
  secondary: z.string().min(1),
  fontSansValue: z.string().min(1),
  radius: z.string().min(1),
  /**
   * The rest of the theme's colour vocabulary, added for the colour
   * picker's theme swatches (ADR-0050): picking one stores
   * `var(--muted)`, so the block follows the theme the way the theme's
   * own CSS does, instead of freezing today's hex into the page.
   *
   * `.optional()` and not `.min(1)` like the four above: those four are
   * declared by every theme that exists, these are not guaranteed, and a
   * theme that omits one should lose a swatch rather than fail to load.
   */
  background: z.string().optional(),
  foreground: z.string().optional(),
  muted: z.string().optional(),
  mutedForeground: z.string().optional(),
  border: z.string().optional(),
  link: z.string().optional(),
});
export type ThemeBaseTokens = z.infer<typeof themeBaseTokensSchema>;

/**
 * What the active theme lets a site do to it — read by the editor so its
 * controls can say no BEFORE somebody spends an afternoon styling
 * something that will never reach the page.
 *
 * Only the one flag, deliberately, rather than the theme's whole
 * `theme.json`: `stickyFooter` is core's rendering business and means
 * nothing to the editor, and a manifest served wholesale becomes a place
 * where private fields end up in a public response by accident.
 *
 * Resolved, not raw: the manifest field is optional and absent means
 * allowed, so the endpoint answers `true` rather than making every caller
 * remember the default.
 */
export const themeCapabilitiesSchema = z.object({
  /** `false` = a bespoke theme refusing to be dressed at all (docs/adr/0021): no Tier 1 token, no per-type block style, no per-instance one. */
  allowStyleOverrides: z.boolean(),
});
export type ThemeCapabilities = z.infer<typeof themeCapabilitiesSchema>;
