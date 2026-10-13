import { describe, expect, it } from 'vitest';
import i18next from '../../i18n';
import { ApiError } from '../../lib/http-client';
import {
  describeRedirectProblem,
  parseRedirectProblemCode,
  redirectProblemOf,
} from './redirect-problems';

describe('parseRedirectProblemCode', () => {
  it('reads the side, the problem and the detail of a code', () => {
    expect(parseRedirectProblemCode('redirect:source:reserved:api')).toEqual({
      side: 'source',
      problem: 'reserved',
      detail: 'api',
    });
  });

  it('keeps the colons of a detail, which an address has', () => {
    expect(
      parseRedirectProblemCode('redirect:source:taken:/?p=1&q=https://x'),
    ).toEqual({
      side: 'source',
      problem: 'taken',
      detail: '/?p=1&q=https://x',
    });
  });

  it('reads a code with no detail', () => {
    expect(parseRedirectProblemCode('redirect:target:loop')).toEqual({
      side: 'target',
      problem: 'loop',
    });
  });

  it.each([
    ['a sentence', 'Page not found'],
    ['a code of another kind', 'theme:upload:too-big'],
    ['a side nobody knows', 'redirect:somewhere:loop'],
    ['no problem', 'redirect:source'],
    ['nothing', null],
  ])('is not fooled by %s', (_label, message) => {
    expect(parseRedirectProblemCode(message)).toBeNull();
  });
});

describe('redirectProblemOf', () => {
  it('reads what the API refused a rule for', () => {
    const error = new ApiError(400, {
      message: 'redirect:target:unknown-placeholder:slug',
    });

    expect(redirectProblemOf(error)).toEqual({
      side: 'target',
      problem: 'unknown-placeholder',
      detail: 'slug',
    });
  });

  it('says nothing of an error that is not one of ours', () => {
    expect(redirectProblemOf(new Error('boom'))).toBeNull();
    expect(redirectProblemOf(new ApiError(500, { message: 'x' }))).toBeNull();
  });
});

describe('describeRedirectProblem', () => {
  const t = i18next.t.bind(i18next);

  it('says a problem in the editor’s words, with the part that was wrong', () => {
    expect(
      describeRedirectProblem(t, {
        side: 'source',
        problem: 'reserved',
        detail: 'api',
      }),
    ).toContain('/api');
    expect(
      describeRedirectProblem(t, {
        side: 'target',
        problem: 'unknown-placeholder',
        detail: ':slug',
      }),
    ).toContain(':slug');
  });

  // The server's own detail is English, for three of its problems: the editor
  // must say them in its language and never show the server's sentence.
  it.each([
    [
      { side: 'target', problem: 'unsafe', detail: 'only http and https' },
      'http e https',
    ],
    [
      { side: 'target', problem: 'unsafe', detail: 'credentials' },
      'nome utente',
    ],
    [
      {
        side: 'target',
        problem: 'invalid',
        detail: 'start with / for a page of this site, or with https://',
      },
      'Inizia con /',
    ],
    [
      {
        side: 'source',
        problem: 'bad-pattern',
        detail: 'a * can only be the last part',
      },
      'ultima parte',
    ],
    [
      { side: 'source', problem: 'bad-pattern', detail: ':slug is used twice' },
      ':slug è usato due volte',
    ],
  ] as const)('says the English detail of %j in Italian', (problem, words) => {
    const said = describeRedirectProblem(t, problem);

    expect(said).toContain(words);
    expect(said).not.toMatch(/start with|can only be|used twice|credentials/);
  });

  it('says every problem the API and the import can give, and none as the generic one', () => {
    const generic = describeRedirectProblem(t, {
      side: 'file',
      problem: 'something-new',
    });
    const known = [
      ['source', ['empty', 'too-long', 'too-deep', 'invalid', 'reserved']],
      [
        'source',
        ['root-without-query', 'bad-pattern', 'pattern-with-query', 'taken'],
      ],
      ['source', ['too-many-query-pairs']],
      ['target', ['empty', 'too-long', 'invalid', 'unsafe']],
      ['target', ['unknown-placeholder', 'same-as-source', 'loop', 'external']],
      ['file', ['missing-from', 'missing-to', 'bad-status']],
      ['site', ['limit']],
    ] as const;

    for (const [side, problems] of known) {
      for (const problem of problems) {
        expect(describeRedirectProblem(t, { side, problem })).not.toBe(generic);
      }
    }
  });

  it('falls back to a sentence for a problem it does not know, rather than the code', () => {
    const said = describeRedirectProblem(t, {
      side: 'target',
      problem: 'a-future-one',
    });

    expect(said).not.toContain('a-future-one');
    expect(said.length).toBeGreaterThan(0);
  });
});
