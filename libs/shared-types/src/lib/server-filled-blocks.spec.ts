import { describe, expect, it } from 'vitest';
import type { ZodObject, ZodRawShape } from 'zod';
import {
  articleMetaPropsSchema,
  articleNavPropsSchema,
  pageGridPropsSchema,
  relatedPagesPropsSchema,
  termListPropsSchema,
} from './content-model';
import {
  siblingPagesPropsSchema,
  siteMapPropsSchema,
  subPagesPropsSchema,
  tableOfContentsPropsSchema,
} from './content-and-navigation-blocks';
import { authorBoxPropsSchema } from './author';
import {
  hasServerFilledBlock,
  isServerFilledBlockType,
  SERVER_FILLED_BLOCK_TYPES,
  SERVER_FILLED_PROPS,
  type ServerFilledBlockType,
} from './server-filled-blocks';

const SCHEMAS: Record<ServerFilledBlockType, ZodObject<ZodRawShape>> = {
  PageGrid: pageGridPropsSchema,
  ArticleMeta: articleMetaPropsSchema,
  ArticleNav: articleNavPropsSchema,
  RelatedPages: relatedPagesPropsSchema,
  TermList: termListPropsSchema,
  TableOfContents: tableOfContentsPropsSchema,
  SubPages: subPagesPropsSchema,
  SiblingPages: siblingPagesPropsSchema,
  SiteMap: siteMapPropsSchema,
  AuthorBox: authorBoxPropsSchema,
};

describe('server-filled blocks', () => {
  /*
   * A name here that the block does not have would be an answer nobody
   * copies back, and the block would go on drawing empty in the canvas
   * with nothing failing.
   */
  it.each(SERVER_FILLED_BLOCK_TYPES)(
    'names only props %s really has',
    (type) => {
      const keys = Object.keys(SCHEMAS[type].shape);
      expect(SERVER_FILLED_PROPS[type].length).toBeGreaterThan(0);
      for (const answer of SERVER_FILLED_PROPS[type]) {
        expect(keys).toContain(answer);
      }
    },
  );

  it('tells a filled block from an ordinary one', () => {
    expect(isServerFilledBlockType('AuthorBox')).toBe(true);
    expect(isServerFilledBlockType('Heading')).toBe(false);
  });

  it('finds one nested inside a container', () => {
    expect(
      hasServerFilledBlock([
        {
          type: 'Container',
          props: {},
          children: [
            { type: 'Text', props: {} },
            { type: 'ArticleMeta', props: {} },
          ],
        },
      ]),
    ).toBe(true);
    expect(hasServerFilledBlock([{ type: 'Text', props: {} }])).toBe(false);
  });
});
