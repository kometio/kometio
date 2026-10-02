import { describe, expect, it } from 'vitest';
import { Taxonomy } from './taxonomy';

const base = {
  id: 'taxonomy-1',
  tenantId: 'tenant-1',
  siteId: 'site-1',
  name: { it: 'Categoria', en: 'Category' },
};

describe('Taxonomy.create', () => {
  /*
   * Nesting on by default: a dimension that turns out to be flat costs
   * nothing, while discovering halfway through that terms cannot nest
   * means rebuilding the tree by hand.
   */
  it('nests by default and starts at the front of the list', () => {
    const taxonomy = Taxonomy.create({ ...base, prefix: 'categoria' });

    expect(taxonomy.hierarchical).toBe(true);
    expect(taxonomy.order).toBe(0);
  });

  /** `null` is a deliberate answer — the terms live at the site root (docs/adr/0064). */
  it('keeps a null prefix as a null prefix', () => {
    const taxonomy = Taxonomy.create({ ...base, prefix: null });

    expect(taxonomy.prefix).toBeNull();
  });

  it('can be flat from the start', () => {
    const taxonomy = Taxonomy.create({
      ...base,
      prefix: 'tag',
      hierarchical: false,
    });

    expect(taxonomy.hierarchical).toBe(false);
  });
});

describe('Taxonomy mutations', () => {
  function taxonomy() {
    return Taxonomy.create({
      ...base,
      prefix: 'categoria',
      now: new Date('2026-01-01T00:00:00Z'),
    });
  }

  it('renames and stamps the change', () => {
    const subject = taxonomy();

    subject.rename({ it: 'Famiglia' }, new Date('2026-02-01T00:00:00Z'));

    expect(subject.name).toEqual({ it: 'Famiglia' });
    expect(subject.updatedAt).toEqual(new Date('2026-02-01T00:00:00Z'));
    expect(subject.createdAt).toEqual(new Date('2026-01-01T00:00:00Z'));
  });

  it('moves every term at once by changing the prefix', () => {
    const subject = taxonomy();

    subject.setPrefix(null);

    expect(subject.prefix).toBeNull();
  });

  it('reorders and switches nesting', () => {
    const subject = taxonomy();

    subject.setOrder(3);
    subject.setHierarchical(false);

    expect(subject.order).toBe(3);
    expect(subject.hierarchical).toBe(false);
  });
});

describe('Taxonomy.fromProps / toProps', () => {
  it('round-trips without sharing the object it was built from', () => {
    const props = Taxonomy.create({ ...base, prefix: 'categoria' }).toProps();

    const restored = Taxonomy.fromProps(props);
    restored.rename({ it: 'Altro' });

    expect(props.name).toEqual({ it: 'Categoria', en: 'Category' });
  });
});
