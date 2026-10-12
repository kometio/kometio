import { describe, expect, it } from 'vitest';
import {
  createReusableSectionBodyShape,
  listReusableSectionsQuerySchema,
  renameReusableSectionBodySchema,
  reusableSectionNameSchema,
  rollbackReusableSectionBodySchema,
  saveReusableSectionDraftBodyShape,
  setReusableSectionExposedFieldsBodySchema,
} from './reusable-section-requests';

const id = '00000000-0000-4000-8000-000000000000';
const blocks = [{ id: 'a', type: 'Text', props: { body: '<p>ciao</p>' } }];

describe('reusableSectionNameSchema', () => {
  it('trims a name, and bounds it', () => {
    expect(reusableSectionNameSchema.parse('  Footer  ')).toBe('Footer');
    expect(reusableSectionNameSchema.safeParse('   ').success).toBe(false);
    expect(reusableSectionNameSchema.safeParse('x'.repeat(121)).success).toBe(
      false,
    );
  });
});

describe('createReusableSectionBodyShape', () => {
  it('creates a shared section or a template, with its content if it is made out of a page’s blocks', () => {
    expect(
      createReusableSectionBodyShape.safeParse({
        siteId: id,
        name: 'Hero',
        kind: 'shared',
      }).success,
    ).toBe(true);
    expect(
      createReusableSectionBodyShape.safeParse({
        siteId: id,
        name: 'Hero',
        kind: 'template',
        content: blocks,
      }).success,
    ).toBe(true);
  });

  it('refuses a kind there is not', () => {
    expect(
      createReusableSectionBodyShape.safeParse({
        siteId: id,
        name: 'Hero',
        kind: 'header',
      }).success,
    ).toBe(false);
  });
});

describe('the other bodies of a section', () => {
  it('lists a site’s, saves a draft of blocks, renames, sets the fields an instance may change, and rolls back', () => {
    expect(
      listReusableSectionsQuerySchema.safeParse({ siteId: id }).success,
    ).toBe(true);
    expect(
      saveReusableSectionDraftBodyShape.safeParse({ content: blocks }).success,
    ).toBe(true);
    expect(
      renameReusableSectionBodySchema.safeParse({ name: 'Nuovo' }).success,
    ).toBe(true);
    expect(
      setReusableSectionExposedFieldsBodySchema.safeParse({ exposedFields: {} })
        .success,
    ).toBe(true);
    expect(
      rollbackReusableSectionBodySchema.safeParse({ versionId: id }).success,
    ).toBe(true);
    expect(
      rollbackReusableSectionBodySchema.safeParse({ versionId: 'v' }).success,
    ).toBe(false);
  });
});
