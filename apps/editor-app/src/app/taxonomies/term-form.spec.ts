import { describe, expect, it } from 'vitest';
import { buildTermRecord } from '@kometio/testing/records';
import { termFormToChanges, termToFormValues } from './term-form';

const term = buildTermRecord({
  name: { it: 'Macchine', en: 'Machines', fr: 'Machines FR' },
  slugs: { it: 'macchine', en: 'machines' },
  description: { it: 'Le macchine da caffè' },
  parentId: 'parent-1',
  noindex: true,
  landingPageGroupId: 'page-9',
});

describe('termToFormValues', () => {
  it('gives every language of the site a field, filled or not', () => {
    expect(termToFormValues(term, ['it', 'en', 'de'])).toEqual({
      names: { it: 'Macchine', en: 'Machines', de: '' },
      slugs: { it: 'macchine', en: 'machines', de: '' },
      descriptions: { it: 'Le macchine da caffè', en: '', de: '' },
      parentId: 'parent-1',
      noindex: true,
      landingPageGroupId: 'page-9',
    });
  });

  it('puts a term at the first level as an empty parent', () => {
    expect(
      termToFormValues(buildTermRecord({ parentId: null }), ['it']).parentId,
    ).toBe('');
  });
});

describe('termFormToChanges', () => {
  const values = termToFormValues(term, ['it', 'en']);

  it('keeps the languages the form does not show', () => {
    const changes = termFormToChanges(term, values);

    // French is not a language of the site any more, and is not the
    // form's to erase.
    expect(changes.name).toEqual({
      it: 'Macchine',
      en: 'Machines',
      fr: 'Machines FR',
    });
  });

  // An emptied slug is not an empty address: the term is not published in
  // that language, which the API models as the key being absent.
  it('drops a language from the map when its slug is cleared', () => {
    const changes = termFormToChanges(term, {
      ...values,
      slugs: { it: 'macchine', en: '   ' },
    });

    expect(changes.slugs).toEqual({ it: 'macchine' });
  });

  it('trims what was typed', () => {
    const changes = termFormToChanges(term, {
      ...values,
      slugs: { it: '  caffe  ', en: 'machines' },
      names: { it: ' Caffè ', en: 'Machines' },
    });

    expect(changes.slugs).toEqual({ it: 'caffe', en: 'machines' });
    expect(changes.name).toMatchObject({ it: 'Caffè' });
  });

  it('does not send an empty string for a language that never had one', () => {
    const changes = termFormToChanges(
      buildTermRecord({ name: { it: 'X' }, description: {} }),
      termToFormValues(buildTermRecord({ name: { it: 'X' } }), ['it', 'en']),
    );

    expect(changes.name).toEqual({ it: 'X' });
    expect(changes.description).toEqual({});
  });

  it('sends the switches and the landing page as they are, null included', () => {
    const changes = termFormToChanges(term, {
      ...values,
      noindex: false,
      landingPageGroupId: null,
    });

    expect(changes.noindex).toBe(false);
    expect(changes.landingPageGroupId).toBeNull();
  });
});
