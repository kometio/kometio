import { useQuery } from '@tanstack/react-query';
import type {
  Block,
  BlockAlign,
  BlockStyleDefaults,
  BlockStyleOverride,
  ResponsiveBlockStyle,
  StyleBreakpoint,
} from '@kometio/shared-types';
import type {
  BlockDescriptor,
  BlockStylePropertyName,
} from '@kometio/block-registry';
import { blockStyleDefaultsQueryOptions } from '../style/block-style-defaults-queries';
import { themeBaseTokensQueryOptions } from '../style/theme-base-tokens-queries';
import { useActiveThemeName } from '../style/use-active-theme-name';
import { useTranslation } from '../../lib/use-translation';
import { BlockStyleFields } from './block-style-fields';
import { InspectorPanel } from './inspector-panel';
import {
  themeAllowsStyleOverrides,
  themeCapabilitiesQueryOptions,
} from '../style/theme-capabilities-queries';
import { themeStylePropertiesQueryOptions } from '../style/theme-style-properties-queries';

export interface PropertiesPanelProps {
  /** Null when nothing is selected — the panel says so rather than disappearing, so the tab it lives in does not flicker in and out of existence. */
  block: Block | null;
  descriptor: BlockDescriptor | null;
  /** True only for a top-level block: the spacing and motion properties belong to the wrapper a root placement has and a nested block does not. */
  isRootLevel: boolean;
  onChangeProp: (key: string, value: unknown) => void;
  onChangeVariant: (variant: string | undefined) => void;
  /** How much page width this block claims (ADR-0049) — present only for a ROOT-level block on a page. */
  onChangeAlign?: (align: BlockAlign | undefined) => void;
  onChangeInstanceStyle: (style: BlockStyleOverride) => void;
  /** The "component-level" override (docs/adr/0022) — the current value for the selected block's TYPE, used as the preview the instance falls back to. */
  typeStyle?: ResponsiveBlockStyle;
  /** Which size the style fields edit — the breakpoint selector's current value (ADR-0047). */
  breakpoint: StyleBreakpoint;
  /** Section editor only — see InspectorPanel's own prop (docs/adr/0059). */
  sectionEditing?: { exposed: string[]; onToggle: (field: string) => void };
}

/**
 * What the fields show as the value a property FALLS BACK TO when left
 * empty.
 *
 * At the base size that is the theme's resolved default. At tablet or
 * mobile it is the base override where one is set, because that is what
 * the block will actually look like there — showing the theme default
 * would tell the reader the block is untouched at that size when it is
 * in fact inheriting a value they themselves set, and the difference is
 * invisible until the page is published.
 */
function styleFieldDefaults(
  themeDefaults: BlockStyleDefaults | undefined,
  style: ResponsiveBlockStyle | undefined,
): BlockStyleDefaults | undefined {
  const base = style?.base;
  if (!base || !themeDefaults) {
    return themeDefaults;
  }
  const inherited = Object.fromEntries(
    Object.entries(base).filter(([, value]) => typeof value === 'string'),
  );
  return { ...themeDefaults, ...inherited };
}

/**
 * The selected block's content, look and styling — the panel itself, now
 * that it has somewhere to live.
 *
 * It used to hang off the toolbar's pencil as a `Popover`, 416px wide,
 * opening over the canvas: with a Hero selected it covered half the Hero
 * AND the top bar with the breakpoints, so seeing the effect of a change
 * meant closing it and making the next change meant opening it again. The
 * panel's CONTENT was never the problem — ADR-0062 put content, style and
 * advanced in one place and that part holds. Where it sat was.
 *
 * It is a tab of the right panel now, beside Layers, which is the model
 * Webflow, Framer and Figma all use and for the same reason: the thing you
 * are editing stays visible while you edit it.
 *
 * Everything the style fields need is fetched here rather than threaded
 * through from the shell — four theme queries, each cached per theme name
 * and never refetched, so they cost nothing per selection.
 */
export function PropertiesPanel({
  block,
  descriptor,
  isRootLevel,
  onChangeProp,
  onChangeVariant,
  onChangeAlign,
  onChangeInstanceStyle,
  typeStyle,
  breakpoint,
  sectionEditing,
}: PropertiesPanelProps) {
  const { t } = useTranslation();
  // Hoisted rather than called inside each query's options: three separate
  // `useActiveThemeName()` calls read the same value, and one name makes it
  // obvious they are meant to.
  const activeThemeName = useActiveThemeName();
  const { data: blockStyleDefaults } = useQuery(
    blockStyleDefaultsQueryOptions(activeThemeName),
  );
  // The theme's own colours, offered as swatches by every colour control
  // below (ADR-0050).
  const { data: themeTokens } = useQuery(
    themeBaseTokensQueryOptions(activeThemeName),
  );
  // What the active theme lets this site put on top of it (docs/adr/0021's
  // ceiling). A theme that refuses is refusing every tier, so no styling
  // control appears — before this they did, saved what you chose, and the
  // published page ignored it.
  const { data: themeCapabilities } = useQuery(
    themeCapabilitiesQueryOptions(activeThemeName),
  );
  // What this theme added to core's style vocabulary (ADR-0047) — the panel
  // needs it to draw a control for a property core never heard of.
  const { data: themeStyleProperties } = useQuery(
    themeStylePropertiesQueryOptions(activeThemeName),
  );

  if (!block || !descriptor) {
    return (
      <p className="px-1 py-2 text-xs text-muted-foreground">
        {t('canvas.properties.noSelection')}
      </p>
    );
  }

  const themeAllowsStyling = themeAllowsStyleOverrides(themeCapabilities);
  const stylableProperties = themeAllowsStyling
    ? (descriptor.stylableProperties ?? [])
    : [];
  // marginTop/marginBottom are per-INSTANCE only (never per-type, see the
  // comment on blockStyleOverrideSchema in site-theme-tokens.ts) and only
  // for a top-level block: they are the one place where
  // PublicPageContent.astro reads `styleOverride.marginTop/marginBottom`
  // for the space between blocks — on a nested block they would have no
  // visual effect at all, so we do not offer them there.
  //
  // ...and all of it only while the theme allows styling at all: the two
  // margins are added AFTER `stylableProperties`, so gating that list alone
  // left them through and the instance controls stayed on a theme that
  // refuses everything.
  const instanceStylableProperties: readonly BlockStylePropertyName[] =
    !themeAllowsStyling
      ? []
      : isRootLevel
        ? [
            ...stylableProperties,
            'marginTop',
            'marginBottom',
            // The motion set (docs/adr/0060) joins the margins for the same
            // two reasons: per-instance only, and root-level only — what
            // animates is the wrapper, which exists once per placement.
            'animation',
            'animationDuration',
            'animationDelay',
            'animationEasing',
            'hoverEffect',
          ]
        : stylableProperties;
  const canStyleInstance = instanceStylableProperties.length > 0;
  // The TYPE override (when present and non-null, i.e. genuinely
  // customized) beats the theme default as the preview for the instance
  // controls: it is what the instance is actually showing until it is
  // restyled at instance level too. `typeStyle` may hold `null` (a property
  // explicitly not customized), which makes no sense to propagate here —
  // BlockStyleDefaults is not nullable.
  const instanceStyleDefaults: BlockStyleDefaults = {
    ...blockStyleDefaults?.[block.type],
    ...Object.fromEntries(
      Object.entries({
        // The type's own base first, then what it changes at this size:
        // together they are what an uncustomized instance really shows
        // here (ADR-0047).
        ...typeStyle?.base,
        ...typeStyle?.[breakpoint],
      }).filter(([, v]) => v != null),
    ),
  };

  return (
    <InspectorPanel
      block={block}
      descriptor={descriptor}
      onChangeProp={onChangeProp}
      onChangeVariant={onChangeVariant}
      onChangeAlign={onChangeAlign}
      sectionEditing={sectionEditing}
      /*
        This block's OWN styling, inside the same panel as its content since
        ADR-0062 — it used to be a second popover behind its own button,
        which meant changing a heading's text and its colour were two
        different places with two different shapes for the same block.
      */
      instanceStyleFields={
        canStyleInstance ? (
          <BlockStyleFields
            blockType={block.type}
            themeProperties={themeStyleProperties?.[block.type]}
            properties={instanceStylableProperties}
            value={block.styleOverride?.[breakpoint] ?? {}}
            onChange={onChangeInstanceStyle}
            defaults={styleFieldDefaults(
              instanceStyleDefaults,
              block.styleOverride,
            )}
            themeTokens={themeTokens}
          />
        ) : null
      }
    />
  );
}
