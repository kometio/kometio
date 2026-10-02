import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import axe from 'axe-core';
import type { ReactNode } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  headerFooterBlocks,
  pageBlocks,
  type BlockDescriptor,
} from '@kometio/block-registry';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { FormListContext } from '../forms/form-list-context';
import { IconListContext } from '../style/icon-list-context';
import { MediaPickerContext } from '../media/media-picker-context';
import { PageListContext } from '../pages/page-list-context';
import { BlockStyleFields } from './block-style-fields';
import { InspectorPanel } from './inspector-panel';
import { TooltipProvider } from '../../components/ui/tooltip';

/*
 * Every core block type's inspector, with its real controls, checked by
 * axe. The browser suite only ever sees the blocks its pages hold; a
 * control nobody's page used — a table, a price list, an event's time —
 * went unnamed without anything noticing (ADR-0088's gap, closed here for
 * the inspector).
 */
const DESCRIPTORS: BlockDescriptor[] = [
  ...new Map(
    [...pageBlocks, ...headerFooterBlocks].map((block) => [block.type, block]),
  ).values(),
];

const nothing = () => Promise.resolve(null);

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      <TooltipProvider>
        <PageListContext.Provider value={{ pick: nothing }}>
          <MediaPickerContext.Provider value={{ pick: nothing }}>
            <FormListContext.Provider value={{ pick: nothing }}>
              <IconListContext.Provider
                value={{
                  pick: nothing,
                  resolve: () => null,
                  isMissingFromTheme: () => false,
                }}
              >
                {children}
              </IconListContext.Provider>
            </FormListContext.Provider>
          </MediaPickerContext.Provider>
        </PageListContext.Provider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

/** What axe finds wrong under `root`, one line per rule and element. */
async function violations(root: Element): Promise<string[]> {
  const results = await axe.run(root, {
    rules: {
      // Not the inspector's to satisfy: a fragment has no landmarks and
      // no page heading, and jsdom lays nothing out to measure contrast.
      region: { enabled: false },
      'heading-order': { enabled: false },
      'color-contrast': { enabled: false },
    },
  });
  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.html}`),
  );
}

beforeAll(() => {
  // No request leaves a test: the pickers that list sites, sections or
  // taxonomies render what they show while their data is unavailable.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new TypeError('No network in this test'))),
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('the inspector of every block type', () => {
  it.each(DESCRIPTORS.map((descriptor) => [descriptor.type, descriptor]))(
    '%s: every control has a name, and no label sits inside another',
    async (_type, descriptor) => {
      const { container } = render(
        <Providers>
          <InspectorPanel
            block={{
              id: 'block-1',
              type: descriptor.type,
              props: { ...descriptor.defaultProps },
            }}
            descriptor={descriptor}
            onChangeProp={vi.fn()}
            onChangeVariant={vi.fn()}
            onChangeAlign={vi.fn()}
            // The section editor's own checkbox, next to every field.
            sectionEditing={{ exposed: [], onToggle: vi.fn() }}
          />
        </Providers>,
      );

      expect(container.querySelector('label label')).toBeNull();
      expect(await violations(container)).toEqual([]);
    },
  );
});

describe('the style controls', () => {
  it('name every control of every property a core block offers', async () => {
    const properties = [
      ...new Set(
        DESCRIPTORS.flatMap(
          (descriptor) => descriptor.stylableProperties ?? [],
        ),
      ),
    ];
    const { container } = render(
      <Providers>
        <BlockStyleFields
          properties={properties}
          blockType="Text"
          value={{ textColor: '#336699' }}
          onChange={vi.fn()}
        />
      </Providers>,
    );

    expect(properties.length).toBeGreaterThan(10);
    expect(await violations(container)).toEqual([]);
  });
});
