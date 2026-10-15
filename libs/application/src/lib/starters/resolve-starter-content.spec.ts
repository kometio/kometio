import { describe, expect, it } from 'vitest';
import {
  emptyStarterIds,
  resolveStarterContent,
} from './resolve-starter-content';
import {
  button,
  form,
  hero,
  parseReference,
  reference,
  toPage,
} from './starter-blocks';

describe('a reference a starter writes', () => {
  it.each(['page', 'form', 'taxonomy', 'term'] as const)(
    'is read back as the %s it names',
    (kind) => {
      expect(parseReference(reference(kind, 'contact-us'))).toEqual({
        kind,
        key: 'contact-us',
      });
    },
  );

  it.each([
    'Contatti',
    'starter:page',
    'starter:page:',
    'starter:other:x',
    'starter:page:UPPER',
    'see starter:page:contact',
  ])('is not what "%s" says', (value) => {
    expect(parseReference(value)).toBeNull();
  });
});

describe('resolveStarterContent', () => {
  function ids() {
    const made = emptyStarterIds();
    made.page.set('contact', 'group-contact');
    made.form.set('contact', 'form-1');
    return made;
  }

  it('puts the real id where a block names a page, and keeps its title', () => {
    const [resolved] = resolveStarterContent(
      [button('Write', toPage('contact', 'Contact'))],
      ids(),
    );

    expect(resolved?.props).toMatchObject({
      linkType: 'page',
      page: { pageGroupId: 'group-contact', title: 'Contact' },
    });
  });

  it('puts the real id where a block names a form', () => {
    const [resolved] = resolveStarterContent(
      [form('contact', 'Contact')],
      ids(),
    );

    expect(resolved?.props).toEqual({
      form: { formId: 'form-1', formName: 'Contact' },
    });
  });

  it('gives every block an id of its own, children included', () => {
    const resolved = resolveStarterContent(
      [
        hero({ title: 'A' }, [button('Go', toPage('contact', 'Contact'))]),
        button('Go', toPage('contact', 'Contact')),
      ],
      ids(),
    );
    const found = [
      resolved[0]?.id,
      resolved[0]?.children?.[0]?.id,
      resolved[1]?.id,
    ];

    expect(found.every((id) => typeof id === 'string' && id !== '')).toBe(true);
    expect(new Set(found).size).toBe(3);
  });

  it('fills in every default the block’s schema has, as the editor writes them', () => {
    const [resolved] = resolveStarterContent(
      [button('Go', toPage('contact', 'Contact'))],
      ids(),
    );

    expect(resolved?.props).toMatchObject({
      size: 'md',
      fullWidth: false,
      openInNewTab: false,
      icon: null,
    });
  });

  it('refuses a block whose props its schema does not take', () => {
    expect(() =>
      resolveStarterContent(
        [{ type: 'Button', props: { label: 'Go' } }],
        ids(),
      ),
    ).toThrow();
  });

  it('says which key a block names that the starter does not have', () => {
    expect(() =>
      resolveStarterContent(
        [button('Go', toPage('missing', 'Missing'))],
        ids(),
      ),
    ).toThrow(/page it does not have: "missing"/);
  });

  it('keeps a block of a type it has no schema for as it is, with an id', () => {
    const [resolved] = resolveStarterContent(
      [{ type: 'ThemeBlock', props: { anything: 1 } }],
      ids(),
    );

    expect(resolved?.props).toEqual({ anything: 1 });
    expect(resolved?.id).toBeTruthy();
  });

  it('does not change the blocks it was given', () => {
    const source = [button('Go', toPage('contact', 'Contact'))];
    const before = JSON.stringify(source);

    resolveStarterContent(source, ids());

    expect(JSON.stringify(source)).toBe(before);
  });
});
