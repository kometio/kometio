import { describe, expect, it } from 'vitest';
import { PageTranslation } from './page-translation';

describe('PageTranslation entity', () => {
  /** Every mutation records its author — the tests that are not about that say so once, here. */
  const EDIT = { by: 'user-1' };

  const baseInput = {
    id: 'translation-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    pageGroupId: 'group-1',
    locale: 'it',
    slug: 'home',
    seoMeta: { title: 'Home', description: 'La home' },
  };

  describe('changing address', () => {
    /*
     * A URL used to be decided once and never again, so the only way to
     * fix a wrong one was deleting the page. Renaming that forgot the old
     * address would trade that for a quieter failure — every saved link
     * and the page's own ranking gone, with nothing to say so.
     */
    it('remembers the address it left, so the old one can still answer', () => {
      const translation = PageTranslation.create(baseInput);

      translation.updateSlug('chi-siamo', EDIT);

      expect(translation.slug).toBe('chi-siamo');
      expect(translation.formerSlugs).toEqual(['home']);
    });

    it('keeps every address it has ever had, oldest first', () => {
      const translation = PageTranslation.create(baseInput);

      translation.updateSlug('chi-siamo', EDIT);
      translation.updateSlug('la-nostra-storia', EDIT);

      expect(translation.formerSlugs).toEqual(['home', 'chi-siamo']);
    });

    it('does not record a rename that changes nothing', () => {
      const translation = PageTranslation.create(baseInput);

      translation.updateSlug('home', EDIT);

      expect(translation.formerSlugs).toEqual([]);
    });

    it('never leaves a slug as both the current address and a redirect to itself', () => {
      const translation = PageTranslation.create(baseInput);

      translation.updateSlug('chi-siamo', EDIT);
      translation.updateSlug('home', EDIT);

      expect(translation.slug).toBe('home');
      expect(translation.formerSlugs).toEqual(['chi-siamo']);
    });
  });

  describe('changing place in the tree', () => {
    it('remembers the parent it hung from, with the slug it had there', () => {
      const translation = PageTranslation.create(baseInput);

      translation.recordMovedFrom('servizi', 'casa', EDIT);

      expect(translation.formerParents).toEqual([
        { parentGroupId: 'servizi', slug: 'home' },
      ]);
    });

    it('remembers the site root as a place like any other', () => {
      const translation = PageTranslation.create(baseInput);

      translation.recordMovedFrom(null, 'servizi', EDIT);

      expect(translation.formerParents).toEqual([
        { parentGroupId: null, slug: 'home' },
      ]);
    });

    it('keeps every place it has hung from, oldest first', () => {
      const translation = PageTranslation.create(baseInput);

      translation.recordMovedFrom(null, 'servizi', EDIT);
      translation.recordMovedFrom('servizi', 'casa', EDIT);

      expect(translation.formerParents).toEqual([
        { parentGroupId: null, slug: 'home' },
        { parentGroupId: 'servizi', slug: 'home' },
      ]);
    });

    it('does not record a move that changes nothing', () => {
      const translation = PageTranslation.create(baseInput);

      translation.recordMovedFrom('servizi', 'servizi', EDIT);

      expect(translation.formerParents).toEqual([]);
    });

    it('never leaves a place as both where it lives and a redirect to itself', () => {
      const translation = PageTranslation.create(baseInput);

      translation.recordMovedFrom(null, 'servizi', EDIT);
      translation.recordMovedFrom('servizi', null, EDIT);

      expect(translation.formerParents).toEqual([
        { parentGroupId: 'servizi', slug: 'home' },
      ]);
    });
  });

  it('starts as a draft, not diverged, with no field-value overrides and no published snapshot', () => {
    const translation = PageTranslation.create(baseInput);
    expect(translation.status).toBe('draft');
    expect(translation.isDiverged).toBe(false);
    expect(translation.divergedContent).toBeNull();
    expect(translation.publishedSnapshot).toBeNull();
    expect(translation.fieldValues).toEqual({});
  });

  it('creation is lightweight — no full content copy, just an empty overlay by default', () => {
    const translation = PageTranslation.create(baseInput);
    expect(translation.fieldValues).toEqual({});
  });

  it('create() accepts an initial fieldValues overlay', () => {
    const translation = PageTranslation.create({
      ...baseInput,
      fieldValues: { 'hero-1': { title: 'Ciao' } },
    });
    expect(translation.fieldValues).toEqual({ 'hero-1': { title: 'Ciao' } });
  });

  it('saveFieldValues replaces the overlay for this locale only', () => {
    const translation = PageTranslation.create(baseInput);
    translation.saveFieldValues({ 'hero-1': { title: 'Ciao' } }, EDIT);
    expect(translation.fieldValues).toEqual({ 'hero-1': { title: 'Ciao' } });
  });

  it('publish freezes the caller-computed merged content and flips status', () => {
    const translation = PageTranslation.create(baseInput);
    const merged = [{ id: 'hero-1', type: 'Hero', props: { title: 'Ciao' } }];

    translation.publish(merged, EDIT);

    expect(translation.status).toBe('published');
    expect(translation.publishedSnapshot).toEqual(merged);
  });

  it('saveFieldValues after publish never touches the already-published snapshot', () => {
    const translation = PageTranslation.create(baseInput);
    translation.publish(
      [{ id: 'hero-1', type: 'Hero', props: { title: 'v1' } }],
      EDIT,
    );

    translation.saveFieldValues({ 'hero-1': { title: 'v2' } }, EDIT);

    expect(translation.publishedSnapshot).toEqual([
      { id: 'hero-1', type: 'Hero', props: { title: 'v1' } },
    ]);
  });

  describe('currentContent', () => {
    const groupContent = [
      { id: 'hero-1', type: 'Hero', props: { title: 'Hello', align: 'left' } },
    ];

    it("lays this language's text over the shared structure while linked", () => {
      const translation = PageTranslation.create({
        ...baseInput,
        fieldValues: { 'hero-1': { title: 'Ciao' } },
      });

      expect(translation.currentContent(groupContent)).toEqual([
        { id: 'hero-1', type: 'Hero', props: { title: 'Ciao', align: 'left' } },
      ]);
    });

    it('ignores the shared structure entirely once unlinked', () => {
      const translation = PageTranslation.create(baseInput);
      const fork = [
        { id: 'text-9', type: 'Text', props: { body: 'Solo mio' } },
      ];
      translation.diverge(fork, EDIT);

      expect(translation.currentContent(groupContent)).toEqual(fork);
    });

    it('refuses an unlinked translation with nothing of its own rather than falling back', () => {
      const translation = PageTranslation.fromProps({
        ...PageTranslation.create(baseInput).toProps(),
        isDiverged: true,
        divergedContent: null,
      });

      expect(() => translation.currentContent(groupContent)).toThrow(
        /diverged but has no divergedContent/,
      );
    });
  });

  it('diverge forks the current merged content and flips isDiverged', () => {
    const translation = PageTranslation.create(baseInput);
    const merged = [{ id: 'hero-1', type: 'Hero', props: { title: 'Ciao' } }];

    translation.diverge(merged, EDIT);

    expect(translation.isDiverged).toBe(true);
    expect(translation.divergedContent).toEqual(merged);
  });

  it('saveDivergedContent updates the independent content of an already-diverged translation', () => {
    const translation = PageTranslation.create(baseInput);
    translation.diverge(
      [{ id: 'hero-1', type: 'Hero', props: { title: 'v1' } }],
      EDIT,
    );

    translation.saveDivergedContent(
      [
        { id: 'hero-1', type: 'Hero', props: { title: 'v2' } },
        { id: 'text-1', type: 'Text', props: { body: 'nuovo' } },
      ],
      EDIT,
    );

    expect(translation.divergedContent).toEqual([
      { id: 'hero-1', type: 'Hero', props: { title: 'v2' } },
      { id: 'text-1', type: 'Text', props: { body: 'nuovo' } },
    ]);
  });

  describe('relinking and restoring', () => {
    const fork = [{ id: 'hero-1', type: 'Hero', props: { title: 'Ciao' } }];

    it('relink follows the shared structure again with the text it is given', () => {
      const translation = PageTranslation.create(baseInput);
      translation.diverge(fork, EDIT);

      translation.relink({ 'hero-1': { title: 'Ciao' } }, { by: 'user-2' });

      expect(translation.isDiverged).toBe(false);
      expect(translation.divergedContent).toBeNull();
      expect(translation.fieldValues).toEqual({ 'hero-1': { title: 'Ciao' } });
      expect(translation.updatedBy).toBe('user-2');
      expect(
        translation.currentContent([
          { id: 'hero-1', type: 'Hero', props: { title: 'Hello' } },
        ]),
      ).toEqual(fork);
    });

    it('restoring a version taken while unlinked unlinks it again', () => {
      const translation = PageTranslation.create(baseInput);

      translation.restoreVersion(
        { fieldValues: {}, divergedContent: fork },
        EDIT,
      );

      expect(translation.isDiverged).toBe(true);
      expect(translation.divergedContent).toEqual(fork);
    });

    it('restoring a version taken while linked links it again, with that text', () => {
      const translation = PageTranslation.create(baseInput);
      translation.diverge(fork, EDIT);

      translation.restoreVersion(
        {
          fieldValues: { 'hero-1': { title: 'Prima' } },
          divergedContent: null,
        },
        EDIT,
      );

      expect(translation.isDiverged).toBe(false);
      expect(translation.divergedContent).toBeNull();
      expect(translation.fieldValues).toEqual({
        'hero-1': { title: 'Prima' },
      });
    });

    it('a version is the content as it stands, by whoever changed it last', () => {
      const translation = PageTranslation.create(baseInput);
      const now = new Date('2026-09-18T10:00:00Z');
      translation.diverge(fork, { by: 'user-2', now });

      expect(translation.toVersion('version-1')).toEqual({
        id: 'version-1',
        tenantId: 'tenant-1',
        pageTranslationId: 'translation-1',
        fieldValues: {},
        seoMeta: baseInput.seoMeta,
        divergedContent: fork,
        createdBy: 'user-2',
        createdAt: now,
      });
    });
  });

  it('updateSeoMeta/updateSlug update independently of publish state', () => {
    const translation = PageTranslation.create(baseInput);
    translation.publish([], EDIT);

    translation.updateSeoMeta(
      { title: 'Nuovo titolo', description: 'Nuova' },
      EDIT,
    );
    translation.updateSlug('nuovo-slug', EDIT);

    expect(translation.seoMeta).toEqual({
      title: 'Nuovo titolo',
      description: 'Nuova',
    });
    expect(translation.slug).toBe('nuovo-slug');
    expect(translation.status).toBe('published');
  });

  it('create() exposes every prop via its getters', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const translation = PageTranslation.create({ ...baseInput, now });

    expect(translation.id).toBe('translation-1');
    expect(translation.tenantId).toBe('tenant-1');
    expect(translation.siteId).toBe('site-1');
    expect(translation.pageGroupId).toBe('group-1');
    expect(translation.locale).toBe('it');
    expect(translation.slug).toBe('home');
    expect(translation.seoMeta).toEqual({
      title: 'Home',
      description: 'La home',
    });
    expect(translation.createdAt).toEqual(now);
    expect(translation.updatedAt).toEqual(now);
  });

  it('fromProps/toProps round-trip without loss', () => {
    const props = {
      ...baseInput,
      fieldValues: { 'hero-1': { title: 'Ciao' } },
      status: 'published' as const,
      formerSlugs: [],
      formerParents: [],
      publishedSnapshot: [{ type: 'Hero', props: { title: 'Ciao' } }],
      isDiverged: false,
      divergedContent: null,
      createdBy: 'user-1',
      createdAt: new Date('2025-12-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      updatedBy: 'user-2',
      contentUpdatedAt: new Date('2026-01-01T00:00:00Z'),
      publishedAt: new Date('2026-01-01T00:00:00Z'),
    };

    const translation = PageTranslation.fromProps(props);

    expect(translation.toProps()).toEqual(props);
  });
});
