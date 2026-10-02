import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineBlock } from './define-block';

const calloutSchema = z.object({
  message: z.string(),
  tone: z.enum(['info', 'warning', 'success']),
});

describe('defineBlock', () => {
  it('returns a BlockDescriptor with the config fields, minus schema', () => {
    const block = defineBlock({
      type: 'TestCallout',
      label: 'Test Callout',
      category: 'content',
      schema: calloutSchema,
      defaultProps: { message: 'Hello', tone: 'info' },
      fields: [{ kind: 'text', key: 'message', label: 'Message' }],
    });

    expect(block).toEqual({
      type: 'TestCallout',
      label: 'Test Callout',
      category: 'content',
      defaultProps: { message: 'Hello', tone: 'info' },
      fields: [{ kind: 'text', key: 'message', label: 'Message' }],
    });
    expect(block).not.toHaveProperty('schema');
  });

  it('throws immediately when defaultProps do not satisfy the schema', () => {
    expect(() =>
      defineBlock({
        type: 'TestCallout',
        label: 'Test Callout',
        category: 'content',
        schema: calloutSchema,
        // @ts-expect-error deliberately invalid for this test
        defaultProps: { message: 'Hello', tone: 'not-a-real-tone' },
        fields: [],
      }),
    ).toThrow();
  });

  it('passes through container/style metadata unchanged', () => {
    const block = defineBlock({
      type: 'TestContainer',
      label: 'Test Container',
      category: 'layout',
      schema: z.object({}),
      defaultProps: {},
      fields: [],
      isContainer: true,
      allowedChildTypes: ['TestCallout'],
      stylableProperties: ['backgroundColor'],
      defaultStyle: { backgroundColor: 'transparent' },
    });

    expect(block.isContainer).toBe(true);
    expect(block.allowedChildTypes).toEqual(['TestCallout']);
    expect(block.stylableProperties).toEqual(['backgroundColor']);
    expect(block.defaultStyle).toEqual({ backgroundColor: 'transparent' });
  });
});
