import { describe, expect, it, vi } from 'vitest';
import {
  globalSearchGroups,
  runGlobalSearchItem,
  type GlobalSearchActions,
} from './global-search-commands';

function actions(): GlobalSearchActions {
  return {
    goTo: vi.fn(),
    openSite: vi.fn(),
    setTheme: vi.fn(),
    setLanguage: vi.fn(),
  };
}

/** An entry as the menu hands it over: only its id matters, except for a file, whose name is its label. */
function entry(id: string) {
  return { id, label: '' };
}

describe('runGlobalSearchItem', () => {
  it('goes to the path an entry says', () => {
    const a = actions();

    runGlobalSearchItem(entry('go:/settings/seo'), a);

    expect(a.goTo).toHaveBeenCalledWith('/settings/seo');
  });

  it.each([
    ['action:new-page', '/pages?page=1&new=true'],
    ['action:upload', '/media'],
    ['action:new-form', '/forms?page=1&new=true'],
    ['action:invite-user', '/settings/users?page=1&invite=true'],
  ])('%s opens %s, where the dialog is one parameter away', (id, path) => {
    const a = actions();

    runGlobalSearchItem(entry(id), a);

    expect(a.goTo).toHaveBeenCalledWith(path);
  });

  it('opens the public site instead of going anywhere in the editor', () => {
    const a = actions();

    runGlobalSearchItem(entry('action:open-site'), a);

    expect(a.openSite).toHaveBeenCalledTimes(1);
    expect(a.goTo).not.toHaveBeenCalled();
  });

  it('changes the theme and the language, and takes only values it knows', () => {
    const a = actions();

    runGlobalSearchItem(entry('pref:theme:dark'), a);
    runGlobalSearchItem(entry('pref:theme:purple'), a);
    runGlobalSearchItem(entry('pref:language:en'), a);

    expect(a.setTheme).toHaveBeenCalledTimes(1);
    expect(a.setTheme).toHaveBeenCalledWith('dark');
    expect(a.setLanguage).toHaveBeenCalledWith('en');
  });

  it('opens a page in the canvas, and a form in its own editor', () => {
    const a = actions();

    runGlobalSearchItem(entry('page:group-1'), a);
    runGlobalSearchItem(entry('form:form-1'), a);

    expect(a.goTo).toHaveBeenNthCalledWith(1, '/page-groups/group-1');
    expect(a.goTo).toHaveBeenNthCalledWith(2, '/forms/form-1');
  });

  it('opens the library narrowed to a file’s name, written safely into the address', () => {
    const a = actions();

    runGlobalSearchItem({ id: 'media:file-1', label: 'logo & più.png' }, a);

    expect(a.goTo).toHaveBeenCalledWith(
      '/media?page=1&search=logo+%26+pi%C3%B9.png',
    );
  });

  it('does nothing for an entry it does not know', () => {
    const a = actions();

    runGlobalSearchItem(entry('mystery:thing'), a);
    runGlobalSearchItem(entry('action:unknown'), a);

    expect(a.goTo).not.toHaveBeenCalled();
  });
});

describe('globalSearchGroups', () => {
  it('lists the six groups in a fixed order, under the words given', () => {
    const groups = globalSearchGroups({
      go: 'Vai a',
      actions: 'Azioni',
      preferences: 'Preferenze',
      pages: 'Pagine',
      media: 'Media',
      forms: 'Moduli',
    });

    expect(groups.map((group) => group.id)).toEqual([
      'go',
      'actions',
      'preferences',
      'pages',
      'media',
      'forms',
    ]);
    expect(groups[0]?.label).toBe('Vai a');
  });
});
