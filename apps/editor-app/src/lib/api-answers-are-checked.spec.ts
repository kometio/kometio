import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccountProfile } from './account-api-client';
import { currentSession } from './auth-api-client';
import { getDashboardStats } from './dashboard-api-client';
import { getDeployment } from './deployment-api-client';
import { previewLegalDocuments } from './legal-documents-api-client';
import { createTranslationPreviewToken } from './preview-token-api-client';
import { fetchSetupStatus } from './setup-api-client';
import { request, send } from './http-client';

/**
 * What a client reads from the server is checked where it arrives: an
 * answer that is not the shape the editor expects fails there, instead of
 * being believed and breaking somewhere far from its cause.
 */
function answered(body: unknown, status = 200) {
  vi.mocked(fetch).mockResolvedValue({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

describe('answers the editor reads', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts the session the server describes, and refuses a role it does not know', async () => {
    answered({ userId: 'u1', email: 'anna@esempio.test', role: 'editor' });
    expect(await currentSession()).toEqual({
      userId: 'u1',
      email: 'anna@esempio.test',
      role: 'editor',
    });

    answered({ userId: 'u1', email: 'anna@esempio.test', role: 'superuser' });
    await expect(currentSession()).rejects.toThrow();
  });

  it.each([
    ['the setup status', () => fetchSetupStatus(), { hasBeenSetUp: 'yes' }],
    [
      'a preview token',
      () => createTranslationPreviewToken('t1'),
      { token: 42, expiresAt: 'x' },
    ],
    ['the dashboard', () => getDashboardStats('s1'), { pages: {} }],
    ['the deployment', () => getDeployment(), { emailConfigured: 'yes' }],
    [
      'a legal preview',
      () =>
        previewLegalDocuments('s1', {
          documents: [],
          locales: [],
          answers: {
            legalEntityName: 'A',
            contactEmail: 'a@esempio.test',
            address: null,
            phone: null,
            vatId: null,
            domain: null,
            dataCollected: {
              contactForm: false,
              newsletter: false,
              accounts: false,
            },
            thirdPartyServices: [],
            retentionDays: null,
            jurisdictionCountry: 'IT',
          },
        }),
      { documents: 'none' },
    ],
    ['the account profile', () => getAccountProfile(), { id: 'u1' }],
  ])('refuses %s that is not what was asked for', async (_name, call, body) => {
    answered(body);
    await expect(call()).rejects.toThrow();
  });

  it('hands back an answer nobody reads as nothing, whatever it says', async () => {
    answered({ success: true });
    await expect(
      send('/auth/logout', { method: 'POST' }),
    ).resolves.toBeUndefined();
  });

  it('leaves the reading of `request` to the caller: what comes back is not yet trusted', async () => {
    answered({ anything: 1 });
    const answer: unknown = await request('/anything');
    expect(answer).toEqual({ anything: 1 });
  });
});
