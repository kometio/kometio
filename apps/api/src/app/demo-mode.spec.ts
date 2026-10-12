import {
  isForAdminsOnly,
  isRefusedInDemo,
  REFUSED_IN_DEMO,
  roleInDemo,
} from './demo-mode';

describe('roleInDemo', () => {
  it('makes an admin a publisher, and leaves the others as they are', () => {
    expect(roleInDemo('admin')).toBe('publisher');
    expect(roleInDemo('publisher')).toBe('publisher');
    expect(roleInDemo('editor')).toBe('editor');
  });
});

describe('isForAdminsOnly', () => {
  it('is true of a route only an admin may call, and of none other', () => {
    expect(isForAdminsOnly(['admin'])).toBe(true);
    expect(isForAdminsOnly(['admin', 'publisher'])).toBe(false);
    expect(isForAdminsOnly(['admin', 'publisher', 'editor'])).toBe(false);
    // A route with no role asked for is the session's alone to check.
    expect(isForAdminsOnly(undefined)).toBe(false);
    expect(isForAdminsOnly([])).toBe(false);
  });
});

describe('isRefusedInDemo', () => {
  it.each([
    ['POST', '/api/media'],
    ['POST', '/api/media/'],
    ['POST', '/api/account/avatar'],
    ['DELETE', '/api/account/avatar'],
    ['POST', '/api/account/password'],
    ['POST', '/api/account/email-change'],
    ['PATCH', '/api/account/profile'],
    [
      'POST',
      '/api/public/forms/0f6c1e7e-0000-4000-8000-000000000000/attachments',
    ],
  ])('refuses %s %s', (method, path) => {
    expect(isRefusedInDemo(method, path)).toBe(true);
  });

  it.each([
    ['GET', '/api/media'],
    ['PATCH', '/api/media/abc'],
    ['PATCH', '/api/account/language'],
    ['GET', '/api/account/profile'],
    ['POST', '/api/page-groups'],
    ['PATCH', '/api/page-groups/abc/content'],
    ['POST', '/api/public/forms/abc/submissions'],
    ['POST', '/api/auth/login'],
    ['POST', '/api/mediafoo'],
  ])('leaves %s %s alone', (method, path) => {
    expect(isRefusedInDemo(method, path)).toBe(false);
  });

  it('reads the method in either case', () => {
    expect(isRefusedInDemo('post', '/api/media')).toBe(true);
  });

  it('says why each refusal is there', () => {
    for (const refusal of REFUSED_IN_DEMO) {
      expect(refusal.because.length).toBeGreaterThan(10);
    }
  });
});
