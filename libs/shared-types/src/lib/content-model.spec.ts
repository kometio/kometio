import { describe, expect, it } from 'vitest';
import {
  backToTopPropsSchema,
  blockSchema,
  hamburgerMenuPropsSchema,
  languageSwitcherPropsSchema,
  navDropdownPropsSchema,
  navLinkPropsSchema,
  navPropsSchema,
  pageContentSchema,
  pickedMediaSchema,
  promoBarPropsSchema,
  seoMetaSchema,
  whatsAppButtonPropsSchema,
} from './content-model';

describe('content-model schemas', () => {
  it('accepts a valid block', () => {
    const result = blockSchema.safeParse({
      type: 'Hero',
      props: { title: 'Kometio' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a block without a type', () => {
    const result = blockSchema.safeParse({ props: {} });
    expect(result.success).toBe(false);
  });

  it('validates a page content array', () => {
    const result = pageContentSchema.safeParse([
      { type: 'Hero', props: { title: 'Kometio' } },
      { type: 'Text', props: { body: 'ciao' } },
    ]);
    expect(result.success).toBe(true);
  });

  it('accepts nested children on a block', () => {
    const result = blockSchema.safeParse({
      type: 'Columns',
      props: {},
      children: [
        { type: 'Text', props: { body: 'colonna 1' } },
        {
          type: 'Columns',
          props: {},
          children: [{ type: 'Text', props: { body: 'annidato due livelli' } }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed nested child', () => {
    const result = blockSchema.safeParse({
      type: 'Columns',
      props: {},
      children: [{ props: {} }],
    });
    expect(result.success).toBe(false);
  });

  it('requires title and description on seo meta', () => {
    expect(
      seoMetaSchema.safeParse({ title: 'x', description: 'y' }).success,
    ).toBe(true);
    expect(seoMetaSchema.safeParse({ title: 'x' }).success).toBe(false);
  });
});

describe('per-block visibility defaults', () => {
  it('Nav defaults to always (its behavior before this field existed)', () => {
    expect(navPropsSchema.parse({}).visibility).toBe('always');
  });

  it('HamburgerMenu defaults to mobile-only (its hardcoded behavior before this field existed)', () => {
    expect(hamburgerMenuPropsSchema.parse({}).visibility).toBe('mobile-only');
  });

  it('NavLink defaults to always', () => {
    expect(
      navLinkPropsSchema.parse({
        label: 'x',
        linkType: 'url',
        page: null,
        url: '',
      }).visibility,
    ).toBe('always');
  });

  it('NavLink defaults icon to null (backward-compat with NavLinks saved before docs/adr/0023)', () => {
    expect(
      navLinkPropsSchema.parse({
        label: 'x',
        linkType: 'url',
        page: null,
        url: '',
      }).icon,
    ).toBe(null);
  });

  it('LanguageSwitcher defaults to always', () => {
    expect(languageSwitcherPropsSchema.parse({}).visibility).toBe('always');
  });

  it('NavDropdown defaults to always', () => {
    expect(navDropdownPropsSchema.parse({ label: 'Prodotti' }).visibility).toBe(
      'always',
    );
  });

  it('BackToTop defaults to always', () => {
    expect(backToTopPropsSchema.parse({}).visibility).toBe('always');
  });

  it('WhatsAppButton defaults to always', () => {
    expect(
      whatsAppButtonPropsSchema.parse({ phoneNumber: '', message: '' })
        .visibility,
    ).toBe('always');
  });

  it('PromoBar defaults to always', () => {
    expect(
      promoBarPropsSchema.parse({
        message: 'x',
        linkType: 'url',
        page: null,
        url: '',
      }).visibility,
    ).toBe('always');
  });

  it('rejects an unknown visibility value', () => {
    expect(
      navPropsSchema.safeParse({ visibility: 'tablet-only' }).success,
    ).toBe(false);
  });
});

describe('pickedMediaSchema', () => {
  it('takes the file’s alternative text, empty included, and its absence', () => {
    const base = { mediaId: 'm1', url: '/uploads/a.webp' };

    expect(pickedMediaSchema.parse({ ...base, alt: 'Una moka' }).alt).toBe(
      'Una moka',
    );
    expect(pickedMediaSchema.parse({ ...base, alt: '' }).alt).toBe('');
    // Every file picked before the library could hold one has none recorded.
    expect(pickedMediaSchema.parse(base).alt).toBeUndefined();
  });
});
