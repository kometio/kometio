import { describe, expect, it } from 'vitest';
import { buildRedirectRecord } from '@kometio/testing/records';
import {
  bodyFromForm,
  emptyRedirectForm,
  formFromRecord,
} from './redirect-form';

const record = buildRedirectRecord;

describe('bodyFromForm', () => {
  const base = emptyRedirectForm('en', '  /old-post ');

  it('sends a page with its language, trimming the old address', () => {
    expect(
      bodyFromForm(
        { ...base, page: { pageGroupId: 'g1', title: 'New' }, locale: 'it' },
        'en',
      ),
    ).toEqual({
      from: '/old-post',
      to: { kind: 'page', pageGroupId: 'g1', locale: 'it' },
      status: 301,
    });
  });

  it('is not complete while a page has not been chosen', () => {
    expect(bodyFromForm(base, 'en')).toBeNull();
  });

  it('sends an address typed, as temporary when it says so', () => {
    expect(
      bodyFromForm(
        { ...base, destination: 'url', url: ' /en/new ', kind: 302 },
        'en',
      ),
    ).toEqual({
      from: '/old-post',
      to: { kind: 'url', url: '/en/new' },
      status: 302,
    });
  });

  it('is not complete while the address is blank', () => {
    expect(
      bodyFromForm({ ...base, destination: 'url', url: '  ' }, 'en'),
    ).toBeNull();
  });

  it('says gone with no destination, whatever was typed before', () => {
    expect(
      bodyFromForm(
        { ...base, destination: 'gone', url: '/stale', kind: 302 },
        'en',
      ),
    ).toEqual({ from: '/old-post', to: null, status: 410 });
  });
});

describe('formFromRecord', () => {
  it('opens a page rule on its page and language', () => {
    expect(
      formFromRecord(
        record({
          from: '/old',
          target: {
            kind: 'page',
            pageGroupId: 'g1',
            locale: 'it',
            title: 'Chi siamo',
            path: '/it/chi-siamo',
            isPublished: true,
          },
          status: 302,
        }),
      ),
    ).toEqual({
      from: '/old',
      destination: 'page',
      page: { pageGroupId: 'g1', title: 'Chi siamo' },
      locale: 'it',
      url: '',
      kind: 302,
    });
  });

  it('opens a rule whose page was deleted on an open choice, in the language it had', () => {
    const values = formFromRecord(
      record({
        target: {
          kind: 'page',
          pageGroupId: null,
          locale: 'it',
          title: null,
          path: null,
          isPublished: false,
        },
        needsATarget: true,
      }),
    );

    expect(values).toMatchObject({
      destination: 'page',
      page: null,
      locale: 'it',
    });
  });

  it('opens an address and a "gone"', () => {
    expect(
      formFromRecord(
        record({ target: { kind: 'url', url: 'https://x.test' } }),
      ),
    ).toMatchObject({ destination: 'url', url: 'https://x.test', kind: 301 });
    expect(formFromRecord(record({ status: 410 }))).toMatchObject({
      destination: 'gone',
    });
  });
});
