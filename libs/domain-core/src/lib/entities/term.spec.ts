import { describe, expect, it } from 'vitest';
import { Term } from './term';

const base = {
  id: 'term-1',
  tenantId: 'tenant-1',
  siteId: 'site-1',
  taxonomyId: 'taxonomy-1',
  name: { it: 'Espresso' },
};

describe('Term.create', () => {
  it('starts at the top level, with the default layout and no landing page', () => {
    const term = Term.create({ ...base, slugs: { it: 'espresso' } });

    expect(term.parentId).toBeNull();
    expect(term.landingPageGroupId).toBeNull();
    expect(term.description).toEqual({});
    expect(term.seoMeta).toEqual({});
  });

  it('carries one address per language', () => {
    const term = Term.create({
      ...base,
      slugs: { it: 'espresso', en: 'espresso-machines' },
    });

    expect(term.slugFor('it')).toBe('espresso');
    expect(term.slugFor('en')).toBe('espresso-machines');
  });

  /*
   * A term exists before it has been named everywhere — a language with
   * no slug is a language the term is not published in, not an error.
   */
  it('has no address in a language nobody has written yet', () => {
    const term = Term.create({ ...base, slugs: { it: 'espresso' } });

    expect(term.slugFor('de')).toBeNull();
  });
});

describe('Term mutations', () => {
  function term() {
    return Term.create({
      ...base,
      slugs: { it: 'espresso', en: 'espresso' },
      now: new Date('2026-01-01T00:00:00Z'),
    });
  }

  it('sets an address in one language without touching the others', () => {
    const subject = term();

    subject.setSlug('en', 'coffee');

    expect(subject.slugs).toEqual({ it: 'espresso', en: 'coffee' });
  });

  /** Removing the address does not remove the term: it simply stops answering in that language. */
  it('drops the address of one language', () => {
    const subject = term();

    subject.setSlug('en', null);

    expect(subject.slugs).toEqual({ it: 'espresso' });
    expect(subject.slugFor('en')).toBeNull();
  });

  it('takes a hand-built landing page and gives it back', () => {
    const subject = term();

    subject.setLandingPage('group-1');
    expect(subject.landingPageGroupId).toBe('group-1');

    subject.setLandingPage(null);
    expect(subject.landingPageGroupId).toBeNull();
  });

  /*
   * The address does not follow the tree — that is the whole return on
   * the flat form (docs/adr/0064): re-filing a term never breaks a link
   * to it.
   */
  it('keeps its address when it is re-filed under a parent', () => {
    const subject = term();

    subject.moveTo('parent-1');

    expect(subject.parentId).toBe('parent-1');
    expect(subject.slugs).toEqual({ it: 'espresso', en: 'espresso' });
  });

  it('carries a description and a SEO block per language', () => {
    const subject = term();

    subject.setDescription({ it: 'Le macchine' });
    subject.setSeoMeta({ it: { title: 'Espresso', description: 'Macchine' } });
    subject.setOrder(2);

    expect(subject.description).toEqual({ it: 'Le macchine' });
    expect(subject.seoMeta['it'].title).toBe('Espresso');
    expect(subject.order).toBe(2);
  });
});

/*
 * A term with two pages under it is a real address for a visitor and a
 * thin one for a crawler. Which of the two it is, only whoever publishes
 * knows — so it is a switch, and it starts off.
 */
describe('keeping a term out of search engines', () => {
  it('is indexable until somebody says otherwise', () => {
    const term = Term.create({ ...base, slugs: { it: 'espresso' } });

    expect(term.noindex).toBe(false);
  });

  it('remembers the switch and when it was flipped', () => {
    const term = Term.create({ ...base, slugs: { it: 'espresso' } });
    const later = new Date('2026-09-24T10:00:00Z');

    term.setNoindex(true, later);

    expect(term.noindex).toBe(true);
    expect(term.updatedAt).toEqual(later);
  });
});

describe('Term.fromProps / toProps', () => {
  /*
   * The slug map is copied on the way in AND out. Handing out the
   * internal object would let a caller add an address by mutating what
   * it read, with no save and no validation anywhere.
   */
  it('never shares its slug map with a caller', () => {
    const term = Term.create({ ...base, slugs: { it: 'espresso' } });

    const props = term.toProps();
    props.slugs['en'] = 'sneaked-in';
    const alsoRead = term.slugs;
    alsoRead['fr'] = 'sneaked-in-too';

    expect(term.slugs).toEqual({ it: 'espresso' });
  });

  it('round-trips through props', () => {
    const original = Term.create({
      ...base,
      parentId: 'parent-1',
      slugs: { it: 'espresso' },
      order: 4,
    });

    const restored = Term.fromProps(original.toProps());

    expect(restored.toProps()).toEqual(original.toProps());
  });
});
