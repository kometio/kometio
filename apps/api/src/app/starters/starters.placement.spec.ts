import { headerFooterBlocks, pageBlocks } from '@kometio/block-registry';
import { STARTERS } from '@kometio/application';
import { STARTER_LANGUAGES, type PageContent } from '@kometio/shared-types';

/**
 * A starter is written as data, and the editor refuses a block that is put
 * where it does not belong (a Step outside Steps, a Button inside a Nav). A
 * starter that did it would make a page the editor cannot open without
 * complaint, so the placement is checked here against the registries the
 * editor itself reads — the one place both the starters and the registries
 * are in reach (the application layer may not depend on the blocks).
 */
type Registry = readonly {
  type: string;
  isContainer?: boolean;
  allowedChildTypes?: string[];
  allowedParentTypes?: string[];
}[];

function placementProblems(
  blocks: PageContent,
  registry: Registry,
  parent: string | null,
  where: string,
): string[] {
  return blocks.flatMap((block) => {
    const descriptor = registry.find(
      (candidate) => candidate.type === block.type,
    );
    if (!descriptor) return [`${where}: ${block.type} is not in the palette`];
    const problems: string[] = [];
    if (descriptor.allowedParentTypes) {
      if (!parent || !descriptor.allowedParentTypes.includes(parent)) {
        problems.push(
          `${where}: ${block.type} may not sit in ${parent ?? 'the page'}`,
        );
      }
    }
    if (parent) {
      const container = registry.find((candidate) => candidate.type === parent);
      if (!container?.isContainer) {
        problems.push(`${where}: ${parent} is not a container`);
      } else if (
        container.allowedChildTypes &&
        !container.allowedChildTypes.includes(block.type)
      ) {
        problems.push(`${where}: ${parent} does not take ${block.type}`);
      }
    }
    return [
      ...problems,
      ...placementProblems(block.children ?? [], registry, block.type, where),
    ];
  });
}

describe.each(STARTERS.map((starter) => [starter.id, starter] as const))(
  'the %s starter’s blocks',
  (_id, starter) => {
    it.each(STARTER_LANGUAGES)(
      'sit where the editor lets them, in %s',
      (language) => {
        const content = starter.content[language]({ siteName: 'Casa Azzurra' });

        const problems = [
          ...placementProblems(
            content.header,
            headerFooterBlocks,
            null,
            'header',
          ),
          ...placementProblems(
            content.footer,
            headerFooterBlocks,
            null,
            'footer',
          ),
          ...content.pages.flatMap((page) =>
            placementProblems(
              page.content,
              pageBlocks,
              null,
              `page ${page.key}`,
            ),
          ),
        ];

        expect(problems).toEqual([]);
      },
    );
  },
);

describe('the placement check', () => {
  it('sees a block outside the parent it belongs in, and one a container does not take', () => {
    const outside: PageContent = [{ type: 'Step', props: {} }];
    const wrongChild: PageContent = [
      { type: 'Nav', props: {}, children: [{ type: 'Heading', props: {} }] },
    ];

    expect(placementProblems(outside, pageBlocks, null, 'x')).toEqual([
      'x: Step may not sit in the page',
    ]);
    expect(
      placementProblems(wrongChild, headerFooterBlocks, null, 'x'),
    ).toEqual(['x: Heading is not in the palette']);
  });
});
