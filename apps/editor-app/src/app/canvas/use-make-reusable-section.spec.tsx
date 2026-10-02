import {
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Block } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import * as api from '../../lib/reusable-sections-api-client';
import { buildReusableSectionRecord } from '@kometio/testing/records';
import { ApiError } from '../../lib/http-client';
import {
  useMakeReusableSection,
  type UseMakeReusableSectionParams,
} from './use-make-reusable-section';

vi.mock('../../lib/reusable-sections-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../lib/reusable-sections-api-client')
    >();
  return {
    ...actual,
    createReusableSection: vi.fn(),
    publishReusableSection: vi.fn(),
  };
});

function descriptor(
  type: string,
  container?: { allowedChildTypes?: string[] },
): BlockDescriptor {
  return {
    type,
    label: type,
    category: 'content',
    defaultProps: {},
    fields: [],
    ...(container ? { isContainer: true, ...container } : {}),
  };
}

const registry = [
  descriptor('Heading'),
  descriptor('Testimonial'),
  descriptor('Container', {}),
  descriptor('Testimonials', { allowedChildTypes: ['Testimonial'] }),
];

const tree: Block[] = [
  { id: 'root-heading', type: 'Heading', props: {} },
  {
    id: 'box',
    type: 'Container',
    props: {},
    children: [{ id: 'boxed-heading', type: 'Heading', props: {} }],
  },
  {
    id: 'testi',
    type: 'Testimonials',
    props: {},
    children: [{ id: 't1', type: 'Testimonial', props: {} }],
  },
];

function offered(selectedId: string, siteId: string | null = 'site-1') {
  const selectedBlock =
    [tree[0], tree[1].children?.[0], tree[2].children?.[0]].find(
      (block) => block?.id === selectedId,
    ) ?? null;
  const { result } = renderHook(() =>
    useMakeReusableSection({
      siteId: siteId ?? undefined,
      selectedBlock,
      localBlocks: tree,
      registry,
      handleReplaceSelected: () => undefined,
    }),
  );
  return result.current !== undefined;
}

/*
 * Turning a block into a section replaces it with a Section instance, in
 * place. Inside a container that only takes one kind of child, that put a
 * Section inside a list of testimonials, or a grid track inside Columns.
 */
describe('useMakeReusableSection', () => {
  it('is offered for a block at the top of the page', () => {
    expect(offered('root-heading')).toBe(true);
  });

  it('is offered inside a container that takes anything', () => {
    expect(offered('boxed-heading')).toBe(true);
  });

  it('is not offered inside a container that may not hold a Section', () => {
    expect(offered('t1')).toBe(false);
  });

  it('is not offered without a site to create the section in', () => {
    expect(offered('root-heading', null)).toBe(false);
  });
});

describe('turning a block into a section', () => {
  function Harness(props: UseMakeReusableSectionParams) {
    const makeReusable = useMakeReusableSection(props);
    return (
      <>
        <button type="button" onClick={makeReusable?.openDialog}>
          rendi riusabile
        </button>
        {makeReusable?.dialog}
      </>
    );
  }

  function renderHarness() {
    const handleReplaceSelected = vi.fn();
    render(
      <Harness
        siteId="site-1"
        selectedBlock={tree[0]}
        localBlocks={tree}
        registry={registry}
        handleReplaceSelected={handleReplaceSelected}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'rendi riusabile' }));
    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'Testata' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crea sezione' }));
    return { handleReplaceSelected };
  }

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates and publishes the section, then puts it where the block was', async () => {
    const created = buildReusableSectionRecord({
      id: 'section-1',
      name: 'Testata',
    });
    vi.mocked(api.createReusableSection).mockResolvedValue(created);
    vi.mocked(api.publishReusableSection).mockResolvedValue(created);

    const { handleReplaceSelected } = renderHarness();

    await waitFor(() => expect(handleReplaceSelected).toHaveBeenCalled());
    expect(api.createReusableSection).toHaveBeenCalledWith({
      siteId: 'site-1',
      name: 'Testata',
      kind: 'shared',
      content: [tree[0]],
    });
    expect(api.publishReusableSection).toHaveBeenCalledWith('section-1');
    expect(handleReplaceSelected).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'Section',
        props: {
          section: { sectionId: 'section-1', sectionName: 'Testata' },
        },
      }),
    );
  });

  it('says a name is taken under the name, which stays typed', async () => {
    vi.mocked(api.createReusableSection).mockRejectedValue(
      new ApiError(409, { message: 'conflict' }),
    );

    const { handleReplaceSelected } = renderHarness();

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Esiste già una sezione con questo nome.',
    );
    expect(screen.getByLabelText('Nome')).toHaveProperty('value', 'Testata');
    expect(handleReplaceSelected).not.toHaveBeenCalled();
  });
});
