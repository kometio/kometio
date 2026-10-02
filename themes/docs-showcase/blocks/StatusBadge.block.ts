import { defineBlock, z } from '@kometio/block-sdk';

/**
 * Docs/adr/0041's own dogfooding proof — a small status pill ("Beta",
 * "Deprecated", "New"), directly motivated by this repo's own real use of
 * exactly this vocabulary (every ADR's own `Status: Accepted` line).
 * Lives here, not in `libs/block-registry`, specifically to prove the
 * Extension Manifest mechanism end to end: registered with zero edits to
 * `libs/block-registry/src/lib/config.ts` or
 * `apps/public-site/src/components/BlockRenderer.astro`.
 */
export const statusBadgePropsSchema = z.object({
  label: z.string(),
  tone: z.enum(['info', 'success', 'warning', 'neutral']),
});
export type StatusBadgeProps = z.infer<typeof statusBadgePropsSchema>;

export default defineBlock({
  type: 'StatusBadge',
  label: 'blocks.statusBadge.label',
  category: 'content',
  schema: statusBadgePropsSchema,
  defaultProps: {
    label: 'Beta',
    tone: 'info',
  },
  fields: [
    {
      kind: 'text',
      key: 'label',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.statusBadge.fields.label.fieldLabel',
    },
    {
      kind: 'select',
      key: 'tone',
      label: 'blocks.statusBadge.fields.tone.fieldLabel',
      options: [
        { label: 'blocks.statusBadge.fields.tone.options.info', value: 'info' },
        {
          label: 'blocks.statusBadge.fields.tone.options.success',
          value: 'success',
        },
        {
          label: 'blocks.statusBadge.fields.tone.options.warning',
          value: 'warning',
        },
        {
          label: 'blocks.statusBadge.fields.tone.options.neutral',
          value: 'neutral',
        },
      ],
    },
  ],
  // The overall pill background/text — deliberately separate from `tone`'s
  // own small accent dot below (StatusBadge.astro), so these two
  // mechanisms never contradict each other over who "owns" color.
  stylableProperties: ['backgroundColor', 'textColor'],
  defaultStyle: {
    backgroundColor: 'var(--muted)',
    textColor: 'var(--muted-foreground)',
  },
});

// `defineBlock()` doesn't store the schema on the returned descriptor
// (libs/block-sdk/src/lib/define-block.ts) — re-exported here, named,
// for `resolve-theme-page-blocks.ts`'s render-time `.parse()` gate, the
// same safety net every core block already gets from BlockRenderer.astro.
export { statusBadgePropsSchema as schema };
