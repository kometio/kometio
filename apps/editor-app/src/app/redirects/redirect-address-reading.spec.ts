import { describe, expect, it } from 'vitest';
import { readTypedAddress } from './redirect-address-reading';

describe('readTypedAddress', () => {
  it('says nothing for an empty field', () => {
    expect(readTypedAddress('   ')).toEqual({ state: 'empty' });
  });

  it('shows a pasted link as the rule will keep it', () => {
    expect(
      readTypedAddress('https://Old-Site.com/2019/05/Hello/?utm=1#top'),
    ).toEqual({
      state: 'exact',
      shown: '/2019/05/hello?utm=1',
      placeholders: [],
    });
  });

  it('keeps the query a migrated site is asked at its front door', () => {
    expect(readTypedAddress('/?p=123')).toMatchObject({
      state: 'exact',
      shown: '/?p=123',
    });
  });

  it('names the parts of a pattern a destination may reuse', () => {
    expect(readTypedAddress('/:year/:month/:slug')).toEqual({
      state: 'pattern',
      shown: '/:year/:month/:slug',
      placeholders: [':year', ':month', ':slug'],
    });
  });

  it('says why an address cannot be a rule, with the part that is wrong', () => {
    expect(readTypedAddress('/api/forms')).toEqual({
      state: 'problem',
      problem: { side: 'source', problem: 'reserved', detail: 'api' },
    });
    expect(readTypedAddress('/post-:id')).toMatchObject({
      state: 'problem',
      problem: { problem: 'bad-pattern', detail: 'post-:id' },
    });
  });
});
