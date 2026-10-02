import { describe, expect, it } from 'vitest';
import type { PageContent } from './content-model';
import { migrateVariantProps } from './migrate-variant-props';

/**
 * The subject is content the current type forbids — a Button whose props
 * still carry `variant` — so the fixtures cannot be built through the
 * type. One cast, here, rather than a looser signature on the function.
 */
const stored = (content: unknown): PageContent => content as PageContent;

/** What `button.block.ts` declares — `primary` is deliberately absent: it was the default look, never a variant. */
const DECLARED = { Button: ['secondary'] };

describe('migrateVariantProps', () => {
  it("moves a Button's variant prop onto the block", () => {
    const result = migrateVariantProps(
      stored([
        {
          id: 'b1',
          type: 'Button',
          props: { label: 'Buy', variant: 'secondary' },
        },
      ]),
      DECLARED,
    );

    expect(result.changed).toBe(true);
    expect(result.content[0].variant).toBe('secondary');
    expect(result.content[0].props).toEqual({ label: 'Buy' });
  });

  // `primary` named the DEFAULT look and has no variant of its own, so
  // absent is exactly what it meant.
  it('drops the old default value rather than storing it as a variant', () => {
    const result = migrateVariantProps(
      stored([
        {
          id: 'b1',
          type: 'Button',
          props: { label: 'Buy', variant: 'primary' },
        },
      ]),
      DECLARED,
    );

    expect(result.changed).toBe(true);
    expect(result.content[0].variant).toBeUndefined();
    expect(result.content[0].props).toEqual({ label: 'Buy' });
  });

  it('reaches a Button nested in children', () => {
    const result = migrateVariantProps(
      stored([
        {
          id: 'col',
          type: 'Columns',
          props: {},
          children: [
            { id: 'b1', type: 'Button', props: { variant: 'secondary' } },
          ],
        },
      ]),
      DECLARED,
    );

    expect(result.changed).toBe(true);
    expect(result.content[0].children?.[0].variant).toBe('secondary');
  });

  it('leaves Callout.tone and PricingPlan.highlighted alone', () => {
    const content = stored([
      { id: 'c1', type: 'Callout', props: { message: 'x', tone: 'warning' } },
      { id: 'p1', type: 'PricingPlan', props: { highlighted: true } },
    ]);

    const result = migrateVariantProps(content, DECLARED);

    expect(result.changed).toBe(false);
    expect(result.content[0].props['tone']).toBe('warning');
    expect(result.content[1].props['highlighted']).toBe(true);
  });

  it('reports nothing changed when everything is already migrated', () => {
    const content = stored([
      {
        id: 'b1',
        type: 'Button',
        props: { label: 'Buy' },
        variant: 'secondary',
      },
    ]);

    const result = migrateVariantProps(content, DECLARED);

    expect(result.changed).toBe(false);
    expect(result.content[0]).toBe(content[0]);
  });

  // A value that cannot become a class must not become one by travelling
  // through a migration instead of through the editor.
  it('drops a prop value that is not a usable variant name', () => {
    const result = migrateVariantProps(
      stored([
        {
          id: 'b1',
          type: 'Button',
          props: { variant: 'secondary; } body { display: none } .x {' },
        },
      ]),
      DECLARED,
    );

    expect(result.content[0].variant).toBeUndefined();
    expect(result.content[0].props).toEqual({});
  });

  it('never mutates the input', () => {
    const content = stored([
      { id: 'b1', type: 'Button', props: { variant: 'secondary' } },
    ]);
    const snapshot = JSON.parse(JSON.stringify(content));

    migrateVariantProps(content, DECLARED);

    expect(content).toEqual(snapshot);
  });
});
