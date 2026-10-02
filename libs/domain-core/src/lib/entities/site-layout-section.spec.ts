import { describe, expect, it } from 'vitest';
import { SiteLayoutSection } from './site-layout-section';

describe('SiteLayoutSection entity', () => {
  const baseInput = {
    id: 'section-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    locale: 'it',
    kind: 'header' as const,
  };

  it('starts as a draft with no published content, not sticky', () => {
    const section = SiteLayoutSection.create(baseInput);
    expect(section.status).toBe('draft');
    expect(section.publishedContent).toBeNull();
    expect(section.content).toEqual([]);
    expect(section.sticky).toBe(false);
  });

  it('create() can start sticky (copy-on-translate from an already-sticky default locale)', () => {
    const section = SiteLayoutSection.create({ ...baseInput, sticky: true });
    expect(section.sticky).toBe(true);
  });

  it('setSticky flips the flag and bumps updatedAt', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const section = SiteLayoutSection.create({ ...baseInput, now });

    const later = new Date('2026-01-02T00:00:00Z');
    section.setSticky(true, later);

    expect(section.sticky).toBe(true);
    expect(section.updatedAt).toEqual(later);
  });

  it('create() can start from a copied content instead of empty', () => {
    const section = SiteLayoutSection.create({
      ...baseInput,
      content: [{ type: 'Header', props: {} }],
    });
    expect(section.content).toEqual([{ type: 'Header', props: {} }]);
  });

  it('saveDraft updates content without touching publishedContent', () => {
    const section = SiteLayoutSection.create(baseInput);
    section.saveDraft([{ type: 'Header', props: {} }]);
    expect(section.content).toEqual([{ type: 'Header', props: {} }]);
    expect(section.publishedContent).toBeNull();
  });

  it('publish promotes the current draft to publishedContent', () => {
    const section = SiteLayoutSection.create(baseInput);
    section.saveDraft([{ type: 'Header', props: {} }]);
    section.publish();
    expect(section.status).toBe('published');
    expect(section.publishedContent).toEqual([{ type: 'Header', props: {} }]);
  });

  it('restoreContent changes the draft but never the already-published content', () => {
    const section = SiteLayoutSection.create(baseInput);
    section.saveDraft([{ type: 'Header', props: { v: 1 } }]);
    section.publish();

    section.restoreContent([{ type: 'Header', props: { v: 0 } }]);

    expect(section.content).toEqual([{ type: 'Header', props: { v: 0 } }]);
    expect(section.publishedContent).toEqual([
      { type: 'Header', props: { v: 1 } },
    ]);
    expect(section.status).toBe('published');
  });

  it('create() exposes every prop via its getters', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const section = SiteLayoutSection.create({ ...baseInput, now });

    expect(section.id).toBe('section-1');
    expect(section.tenantId).toBe('tenant-1');
    expect(section.siteId).toBe('site-1');
    expect(section.locale).toBe('it');
    expect(section.kind).toBe('header');
    expect(section.createdAt).toEqual(now);
    expect(section.updatedAt).toEqual(now);
  });

  it('fromProps/toProps round-trip without loss', () => {
    const props = {
      ...baseInput,
      status: 'published' as const,
      content: [{ type: 'Header', props: {} }],
      publishedContent: [{ type: 'Header', props: {} }],
      sticky: true,
      createdAt: new Date('2025-12-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    };

    const section = SiteLayoutSection.fromProps(props);

    expect(section.toProps()).toEqual(props);
  });
});
