import { describe, expect, it } from 'vitest';
import {
  ChildPageAddressTakenError,
  EmailUnchangedError,
  FormNotFoundError,
  FormSubmissionNotFoundError,
  IncorrectPasswordError,
  InvalidMediaFilenameError,
  InviteNotPendingError,
  InvitePendingError,
  InvalidCredentialsError,
  InvalidFormSubmissionError,
  InvalidOrExpiredTokenError,
  PageGroupNotFoundError,
  PageGroupReorderMismatchError,
  PageGroupVersionNotFoundError,
  TermReorderMismatchError,
  UnreadableImageError,
  PageTranslationDivergedError,
  PageTranslationLocaleAlreadyExistsError,
  PageTranslationNotDivergedError,
  PageTranslationVersionNotFoundError,
  PageTranslationNotFoundError,
  SiteLayoutSectionNotFoundError,
  SiteLayoutSectionVersionNotFoundError,
  PageSlugCollidesWithTermError,
  SiteNotFoundError,
  TaxonomyNotFoundError,
  TaxonomyNotHierarchicalError,
  TaxonomyPrefixAlreadyExistsError,
  TermAddressCollidesWithPageError,
  TermAddressTakenError,
  TermCycleError,
  TermNotFoundError,
} from './errors';

describe('PageGroupVersionNotFoundError', () => {
  it('carries the missing version id in its message and is a real Error', () => {
    const error = new PageGroupVersionNotFoundError('version-1');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PageGroupVersionNotFoundError');
    expect(error.message).toBe('Page group version not found: version-1');
  });
});

describe('PageGroupReorderMismatchError', () => {
  it('is a real Error with a fixed message', () => {
    const error = new PageGroupReorderMismatchError();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PageGroupReorderMismatchError');
    expect(error.message).toBe(
      'The provided page group order does not match the actual sibling group',
    );
  });
});

describe('InvalidCredentialsError', () => {
  it('carries a generic message that never reveals which part was wrong', () => {
    const error = new InvalidCredentialsError();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('InvalidCredentialsError');
    expect(error.message).toBe('Invalid email or password');
  });
});

describe('InvalidOrExpiredTokenError', () => {
  it('is a real Error with a generic message', () => {
    const error = new InvalidOrExpiredTokenError();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('InvalidOrExpiredTokenError');
    expect(error.message).toBe('Invalid or expired token');
  });
});

describe('SiteNotFoundError', () => {
  it('carries the missing site id in its message and is a real Error', () => {
    const error = new SiteNotFoundError('site-1');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SiteNotFoundError');
    expect(error.message).toBe('Site not found: site-1');
  });
});

describe('FormNotFoundError', () => {
  it('carries the missing form id in its message and is a real Error', () => {
    const error = new FormNotFoundError('form-1');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('FormNotFoundError');
    expect(error.message).toBe('Form not found: form-1');
  });
});

describe('InvalidFormSubmissionError', () => {
  it('carries the given message and is a real Error', () => {
    const error = new InvalidFormSubmissionError(
      'Missing required field: email',
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('InvalidFormSubmissionError');
    expect(error.message).toBe('Missing required field: email');
  });
});

describe('SiteLayoutSectionNotFoundError', () => {
  it('carries the missing section id in its message and is a real Error', () => {
    const error = new SiteLayoutSectionNotFoundError('section-1');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SiteLayoutSectionNotFoundError');
    expect(error.message).toBe('Site layout section not found: section-1');
  });
});

describe('PageGroupNotFoundError', () => {
  it('carries the missing group id in its message and is a real Error', () => {
    const error = new PageGroupNotFoundError('group-1');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PageGroupNotFoundError');
    expect(error.message).toBe('Page group not found: group-1');
  });
});

describe('PageTranslationNotFoundError', () => {
  it('carries the missing translation id in its message and is a real Error', () => {
    const error = new PageTranslationNotFoundError('translation-1');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PageTranslationNotFoundError');
    expect(error.message).toBe('Page translation not found: translation-1');
  });
});

describe('PageTranslationLocaleAlreadyExistsError', () => {
  it('carries the locale in its message and is a real Error', () => {
    const error = new PageTranslationLocaleAlreadyExistsError('en');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PageTranslationLocaleAlreadyExistsError');
    expect(error.message).toBe(
      'This page group already has a translation in "en"',
    );
  });
});

describe('PageTranslationDivergedError', () => {
  it('carries the translation id in its message and is a real Error', () => {
    const error = new PageTranslationDivergedError('translation-1');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PageTranslationDivergedError');
    expect(error.message).toBe(
      'Page translation translation-1 is diverged from the shared structure',
    );
  });
});

describe('PageTranslationVersionNotFoundError', () => {
  it('carries the version id in its message and is a real Error', () => {
    const error = new PageTranslationVersionNotFoundError('version-1');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PageTranslationVersionNotFoundError');
    expect(error.message).toBe('Page translation version not found: version-1');
  });
});

describe('PageTranslationNotDivergedError', () => {
  it('carries the translation id in its message and is a real Error', () => {
    const error = new PageTranslationNotDivergedError('translation-1');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PageTranslationNotDivergedError');
    expect(error.message).toBe(
      'Page translation translation-1 has not diverged from the shared structure',
    );
  });
});

describe('SiteLayoutSectionVersionNotFoundError', () => {
  it('carries the missing version id in its message and is a real Error', () => {
    const error = new SiteLayoutSectionVersionNotFoundError('version-1');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SiteLayoutSectionVersionNotFoundError');
    expect(error.message).toBe(
      'Site layout section version not found: version-1',
    );
  });
});

/*
 * The classification errors (docs/adr/0064, ADR-0065) as one table: what
 * matters about each is the same three things, and the API maps them by
 * class while logs and clients read `name` and `message`. Written as one
 * table rather than eight near-identical describes, which is what the
 * previous ones would also be if they were written today.
 */
describe('taxonomy errors', () => {
  const cases: [Error, string, string][] = [
    [
      new TaxonomyNotFoundError('taxonomy-1'),
      'TaxonomyNotFoundError',
      'Taxonomy not found: taxonomy-1',
    ],
    [
      new TermNotFoundError('term-1'),
      'TermNotFoundError',
      'Term not found: term-1',
    ],
    [
      new TaxonomyPrefixAlreadyExistsError('categoria'),
      'TaxonomyPrefixAlreadyExistsError',
      'Another taxonomy already uses the prefix "categoria"',
    ],
    [
      new TermAddressTakenError('categoria/espresso'),
      'TermAddressTakenError',
      'Another term already answers at "categoria/espresso"',
    ],
    [
      new TermAddressCollidesWithPageError('espresso'),
      'TermAddressCollidesWithPageError',
      'A page already answers at "espresso"',
    ],
    [
      new PageSlugCollidesWithTermError('espresso'),
      'PageSlugCollidesWithTermError',
      'A taxonomy or term already answers at "espresso"',
    ],
    [
      new TermCycleError(),
      'TermCycleError',
      'A term cannot become its own descendant',
    ],
    [
      new TaxonomyNotHierarchicalError('taxonomy-1'),
      'TaxonomyNotHierarchicalError',
      'Taxonomy taxonomy-1 does not allow nested terms',
    ],
  ];

  it.each(cases)(
    '%s is a real Error naming what went wrong',
    (error, name, message) => {
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe(name);
      expect(error.message).toBe(message);
    },
  );
});

/**
 * The names and messages the API answers with: the HTTP mapping is keyed on
 * the class, and a person reads the message when nothing translates it.
 */
describe('the errors of changing how you sign in', () => {
  it('IncorrectPasswordError says the confirmation was wrong, not the session', () => {
    const error = new IncorrectPasswordError();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('IncorrectPasswordError');
    expect(error.message).toBe('The current password is not correct');
  });

  it('EmailUnchangedError says there is nothing to change', () => {
    const error = new EmailUnchangedError();

    expect(error.name).toBe('EmailUnchangedError');
    expect(error.message).toBe('That is already the email of this account');
  });
});

describe('the errors of an invitation that is not in the state asked for', () => {
  it('InviteNotPendingError names the user and says there is no pending invitation', () => {
    const error = new InviteNotPendingError('user-1');

    expect(error.name).toBe('InviteNotPendingError');
    expect(error.message).toBe('No pending invitation for this user: user-1');
  });

  it('InvitePendingError names the user and says they have not accepted yet', () => {
    const error = new InvitePendingError('user-1');

    expect(error.name).toBe('InvitePendingError');
    expect(error.message).toBe(
      'This user has not accepted their invitation yet: user-1',
    );
  });
});

describe('InvalidMediaFilenameError', () => {
  it('carries why the name was refused', () => {
    const error = new InvalidMediaFilenameError('it has a slash');

    expect(error.name).toBe('InvalidMediaFilenameError');
    expect(error.message).toBe('Invalid media filename: it has a slash');
  });
});

describe('FormSubmissionNotFoundError', () => {
  it('carries the missing submission id', () => {
    const error = new FormSubmissionNotFoundError('submission-1');

    expect(error.name).toBe('FormSubmissionNotFoundError');
    expect(error.message).toBe('Form submission not found: submission-1');
  });
});

describe('UnreadableImageError', () => {
  it('tells the person what to do, and keeps what the decoder said', () => {
    const cause = new Error('vipspng: libpng read error');

    const error = new UnreadableImageError({ cause });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('UnreadableImageError');
    expect(error.message).toBe(
      'The file could not be read as an image. Try another file.',
    );
    expect(error.cause).toBe(cause);
  });
});

describe('TermReorderMismatchError', () => {
  it('says the list given is not the terms that share the parent', () => {
    const error = new TermReorderMismatchError();

    expect(error.name).toBe('TermReorderMismatchError');
    expect(error.message).toBe(
      'The provided term order does not match the actual sibling terms',
    );
  });
});

describe('ChildPageAddressTakenError', () => {
  it('names the subpage and the language whose address is taken at the top level', () => {
    const error = new ChildPageAddressTakenError('riscaldamento', 'it');

    expect(error.name).toBe('ChildPageAddressTakenError');
    expect(error.slug).toBe('riscaldamento');
    expect(error.locale).toBe('it');
    expect(error.message).toContain('"riscaldamento" (it)');
    expect(error.message).toContain('already taken');
  });
});
