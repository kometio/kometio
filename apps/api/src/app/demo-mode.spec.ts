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
    ['POST', '/api/account/avatar'],
    ['DELETE', '/api/account/avatar'],
    ['POST', '/api/account/password'],
    ['POST', '/api/account/email-change'],
    ['PATCH', '/api/account/profile'],
    ['POST', '/api/public/forms/:id/attachments'],
    ['GET', '/api/forms/:id/submissions'],
    ['GET', '/api/forms/:id/submissions.csv'],
  ])('refuses %s %s', (method, route) => {
    expect(isRefusedInDemo(method, route)).toBe(true);
  });

  it.each([
    ['GET', '/api/media'],
    ['PATCH', '/api/media/:id'],
    ['PATCH', '/api/account/language'],
    ['GET', '/api/account/profile'],
    ['POST', '/api/page-groups'],
    ['PATCH', '/api/page-groups/:id/content'],
    ['POST', '/api/public/forms/:id/submissions'],
    ['POST', '/api/auth/login'],
    ['GET', '/api/forms'],
    ['DELETE', '/api/forms/:id/submissions/:submissionId'],
    ['POST', '/api/mediafoo'],
  ])('leaves %s %s alone', (method, route) => {
    expect(isRefusedInDemo(method, route)).toBe(false);
  });

  it('reads the method in either case', () => {
    expect(isRefusedInDemo('post', '/api/media')).toBe(true);
  });

  it('refuses a write that arrives with no route, and reads on', () => {
    expect(isRefusedInDemo('POST', undefined)).toBe(true);
    expect(isRefusedInDemo('DELETE', undefined)).toBe(true);
    expect(isRefusedInDemo('GET', undefined)).toBe(false);
  });

  it('says why each refusal is there', () => {
    for (const refusal of REFUSED_IN_DEMO) {
      expect(refusal.because.length).toBeGreaterThan(10);
    }
  });
});
