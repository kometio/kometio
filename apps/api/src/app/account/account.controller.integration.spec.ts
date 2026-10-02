import { randomUUID } from 'node:crypto';
import { stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import sharp from 'sharp';
import type { AuthPort, UserRepositoryPort } from '@kometio/ports';
import { AUTH_PORT, USER_REPOSITORY } from '../adapters/port.tokens';
import { SESSION_COOKIE_NAME } from '../auth/session-cookies';
import {
  countEmailsTo,
  fetchEmailedToken,
  subjectsOfEmailsTo,
  waitForMessageCount,
} from '../../test/mailpit.test-fixture';
import { AccountModule } from './account.module';
import {
  IntegrationApp,
  type IntegrationUser,
} from '../../test/integration-app.test-fixture';

// The email-change tests wait on a real Mailpit (mailpit.test-fixture.ts).
jest.setTimeout(30_000);

/**
 * Runs against a real Postgres and writes real files under MEDIA_UPLOAD_DIR
 * — see docs/development.md. Two people under DEFAULT_TENANT_ID, removed
 * in afterAll with every picture this suite stored.
 */
describe('AccountController (integration)', () => {
  let integration: IntegrationApp;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let editor: IntegrationUser;
  const storedKeys: string[] = [];
  // Unique per run: author addresses are unique across the whole tenant.
  const run = randomUUID().slice(0, 8);

  beforeAll(async () => {
    integration = await IntegrationApp.start({ imports: [AccountModule] });
    app = integration.app;

    // An editor, not an admin: every role has a profile of its own.
    editor = await integration.createUser({ role: 'editor' });
    agent = await integration.login(editor);
  });

  afterAll(async () => {
    const uploadDir = process.env.MEDIA_UPLOAD_DIR as string;
    for (const key of storedKeys) {
      await unlink(join(uploadDir, key)).catch(() => undefined);
    }
    await integration.close();
  });

  const storageKeyOf = (url: string) => url.split('/uploads/')[1] ?? '';

  it('refuses anyone without a session', async () => {
    await request(app.getHttpServer()).get('/account/profile').expect(401);
    await request(app.getHttpServer())
      .patch('/account/profile')
      .send({ displayName: 'X', slug: null, bio: {} })
      .expect(401);
  });

  it('shows the signed-in person their own profile, and nothing secret', async () => {
    const res = await agent.get('/account/profile').expect(200);

    expect(res.body).toEqual({
      id: editor.id,
      email: editor.email,
      role: 'editor',
      displayName: null,
      slug: null,
      bio: {},
      avatarUrl: null,
      language: null,
    });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('gives them an address from their name the first time they have one', async () => {
    const res = await agent
      .patch('/account/profile')
      .send({
        displayName: `Giulia Àccount ${run}`,
        slug: null,
        bio: { it: 'Scrive di caffè.', en: 'Writes about coffee.' },
      })
      .expect(200);

    expect(res.body.displayName).toBe(`Giulia Àccount ${run}`);
    expect(res.body.slug).toBe(`giulia-account-${run}`);
    expect(res.body.bio).toEqual({
      it: 'Scrive di caffè.',
      en: 'Writes about coffee.',
    });
  });

  it('refuses an address someone else has — now or before — with a 409', async () => {
    await integration.createUser({
      slug: `preso-${run}`,
      formerSlugs: [`lasciato-${run}`],
    });

    await agent
      .patch('/account/profile')
      .send({ displayName: 'Giulia', slug: `preso-${run}`, bio: {} })
      .expect(409);
    await agent
      .patch('/account/profile')
      .send({ displayName: 'Giulia', slug: `lasciato-${run}`, bio: {} })
      .expect(409);
  });

  it('refuses an address that is not a slug, and a bio that is not keyed by language', async () => {
    await agent
      .patch('/account/profile')
      .send({ displayName: 'Giulia', slug: 'Not A Slug', bio: {} })
      .expect(400);
    await agent
      .patch('/account/profile')
      .send({ displayName: 'Giulia', slug: null, bio: { '<b>': 'x' } })
      .expect(400);
    await agent
      .patch('/account/profile')
      .send({
        displayName: 'Giulia',
        slug: null,
        bio: { it: 'x'.repeat(1001) },
      })
      .expect(400);
  });

  it('stores a picture, replaces it, and removes it — files included', async () => {
    const png = await sharp({
      create: { width: 300, height: 300, channels: 3, background: '#335577' },
    })
      .png()
      .toBuffer();
    const uploadDir = process.env.MEDIA_UPLOAD_DIR as string;

    const first = await agent
      .post('/account/avatar')
      .attach('file', png, 'me.png')
      .expect(200);
    const firstKey = storageKeyOf(first.body.avatarUrl);
    storedKeys.push(firstKey);
    expect(firstKey).toMatch(/\.webp$/);
    await expect(stat(join(uploadDir, firstKey))).resolves.toBeDefined();

    const second = await agent
      .post('/account/avatar')
      .attach('file', png, 'me.png')
      .expect(200);
    const secondKey = storageKeyOf(second.body.avatarUrl);
    storedKeys.push(secondKey);
    // The picture it replaced is gone from disk, not orphaned.
    await expect(stat(join(uploadDir, firstKey))).rejects.toThrow();

    const removed = await agent.delete('/account/avatar').expect(200);
    expect(removed.body.avatarUrl).toBeNull();
    await expect(stat(join(uploadDir, secondKey))).rejects.toThrow();
  });

  it('refuses a file that is not a picture, whatever it is called', async () => {
    await agent
      .post('/account/avatar')
      .attach('file', Buffer.from('<svg onload="alert(1)"></svg>'), 'me.png')
      .expect(400);
    await agent.post('/account/avatar').expect(400);
  });

  const authPort = () => app.get<AuthPort>(AUTH_PORT);

  /**
   * Another place the person is signed in, made straight from the port:
   * the login route allows five a minute from one address, and this
   * suite is not testing it.
   */
  async function signedInFrom(person: IntegrationUser) {
    const session = await authPort().createSession(
      person.id,
      integration.tenantId,
    );
    return request
      .agent(app.getHttpServer())
      .set('Cookie', `${SESSION_COOKIE_NAME}=${session.token}`);
  }

  describe('the language', () => {
    it('is chosen at once, comes back in the profile, and only the two Kometio speaks are taken', async () => {
      const person = await integration.createUser({ role: 'editor' });
      const here = await signedInFrom(person);

      const res = await here
        .patch('/account/language')
        .send({ language: 'en' })
        .expect(200);

      expect(res.body.language).toBe('en');
      expect(
        (await here.get('/account/profile').expect(200)).body.language,
      ).toBe('en');
      await here
        .patch('/account/language')
        .send({ language: 'fr' })
        .expect(400);
      await here.patch('/account/language').send({}).expect(400);
      expect(
        (await here.get('/account/profile').expect(200)).body.language,
      ).toBe('en');
    });

    it('refuses anyone without a session', async () => {
      await request(app.getHttpServer())
        .patch('/account/language')
        .send({ language: 'it' })
        .expect(401);
    });

    it('is the language the emails to that person are written in — the notice after a password change, the link to a new address, the notice to the old one', async () => {
      const person = await integration.createUser({ role: 'editor' });
      const here = await signedInFrom(person);
      await here
        .patch('/account/language')
        .send({ language: 'en' })
        .expect(200);
      const newEmail = `english-${randomUUID()}@example.test`;

      await here
        .post('/account/password')
        .send({
          currentPassword: person.password,
          newPassword: 'another-new-password',
        })
        .expect(204);
      await waitForMessageCount(person.email, 1);
      expect(await subjectsOfEmailsTo(person.email)).toEqual([
        'Your password was changed',
      ]);

      await here
        .post('/account/email-change')
        .send({ newEmail, currentPassword: 'another-new-password' })
        .expect(204);
      const token = await fetchEmailedToken(newEmail, 'changeToken');
      // The link goes to the new address, in the language of the person who asked.
      expect(await subjectsOfEmailsTo(newEmail)).toEqual([
        'Confirm your new email address',
      ]);
      await request(app.getHttpServer())
        .post('/auth/confirm-email-change')
        .send({ token })
        .expect(200);
      await waitForMessageCount(person.email, 2);
      expect(await subjectsOfEmailsTo(person.email)).toContain(
        'Your sign-in address was changed',
      );
    });
  });

  describe('changing the password', () => {
    const NEW_PASSWORD = 'a-brand-new-password';
    /** Whether `password` is what the database now holds for the person. */
    async function hasPassword(person: IntegrationUser, password: string) {
      const stored = await app
        .get<UserRepositoryPort>(USER_REPOSITORY)
        .findById(integration.tenantId, person.id);
      return authPort().verifyPassword(password, stored?.passwordHash ?? '');
    }

    it('refuses anyone without a session', async () => {
      await request(app.getHttpServer())
        .post('/account/password')
        .send({ currentPassword: 'x', newPassword: NEW_PASSWORD })
        .expect(401);
    });

    it('changes it, ends the other sessions, keeps the one it was made from — and the new one signs in', async () => {
      // Italian chosen, not left to the site: what this database's site speaks is not what is tested here.
      const person = await integration.createUser({
        role: 'editor',
        language: 'it',
      });
      const here = await signedInFrom(person);
      const elsewhere = await signedInFrom(person);

      await here
        .post('/account/password')
        .send({ currentPassword: person.password, newPassword: NEW_PASSWORD })
        .expect(204);

      await here.get('/account/profile').expect(200);
      await elsewhere.get('/account/profile').expect(401);
      expect(await hasPassword(person, person.password)).toBe(false);
      // The real owner's way of finding out that somebody else did it.
      await waitForMessageCount(person.email, 1);
      expect(await subjectsOfEmailsTo(person.email)).toEqual([
        'La tua password è stata cambiata',
      ]);
      // The real sign-in, over HTTP: the one thing that proves it is usable.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: person.email,
          password: NEW_PASSWORD,
          captchaToken: 'test-token',
        })
        .expect(200);
    });

    it('refuses a wrong current password with a 403 — the session stays valid — and changes nothing', async () => {
      const person = await integration.createUser({ role: 'editor' });
      const here = await signedInFrom(person);
      const elsewhere = await signedInFrom(person);

      const res = await here
        .post('/account/password')
        .send({ currentPassword: 'not-it', newPassword: NEW_PASSWORD })
        .expect(403);

      expect(res.body.message).toBe('The current password is not correct');
      await here.get('/account/profile').expect(200);
      await elsewhere.get('/account/profile').expect(200);
      expect(await hasPassword(person, person.password)).toBe(true);
      expect(await countEmailsTo(person.email)).toBe(0);
    });

    it('refuses a new password that is too short, saying which field', async () => {
      const person = await integration.createUser({ role: 'editor' });
      const here = await signedInFrom(person);

      const res = await here
        .post('/account/password')
        .send({ currentPassword: person.password, newPassword: 'short' })
        .expect(400);

      expect(res.body.fieldErrors.newPassword).toHaveLength(1);
      expect(await hasPassword(person, person.password)).toBe(true);
    });

    it('stops guessing after five wrong tries — even the right password is not heard then', async () => {
      const person = await integration.createUser({ role: 'editor' });
      const here = await signedInFrom(person);

      for (let attempt = 0; attempt < 5; attempt++) {
        await here
          .post('/account/password')
          .send({
            currentPassword: `guess-${attempt}`,
            newPassword: NEW_PASSWORD,
          })
          .expect(403);
      }
      await here
        .post('/account/password')
        .send({ currentPassword: person.password, newPassword: NEW_PASSWORD })
        .expect(429);

      expect(await hasPassword(person, person.password)).toBe(true);
    });
  });

  describe('changing the email', () => {
    const unique = () => `changed-${randomUUID()}@example.test`;

    it('refuses anyone without a session', async () => {
      await request(app.getHttpServer())
        .post('/account/email-change')
        .send({ newEmail: unique(), currentPassword: 'x' })
        .expect(401);
    });

    it('changes nothing until the link sent to the NEW address is followed, then signs in with it', async () => {
      const person = await integration.createUser({
        role: 'editor',
        language: 'it',
      });
      const here = await signedInFrom(person);
      const newEmail = unique();

      await here
        .post('/account/email-change')
        .send({ newEmail, currentPassword: person.password })
        .expect(204);

      // Asked, not done: the account is still the old address.
      expect((await here.get('/account/profile').expect(200)).body.email).toBe(
        person.email,
      );
      const token = await fetchEmailedToken(newEmail, 'changeToken');
      // Nothing went to the old address.
      expect(await countEmailsTo(person.email)).toBe(0);

      // The link is opened from a mailbox: no session on the request.
      await request(app.getHttpServer())
        .post('/auth/confirm-email-change')
        .send({ token })
        .expect(200);

      expect((await here.get('/account/profile').expect(200)).body.email).toBe(
        newEmail,
      );
      // The address left behind is told: its inbox can warn the real owner.
      await waitForMessageCount(person.email, 1);
      expect(await subjectsOfEmailsTo(person.email)).toEqual([
        'Il tuo indirizzo di accesso è stato cambiato',
      ]);
      // The sign-in itself, over HTTP: the new address with the same password.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: newEmail,
          password: person.password,
          captchaToken: 'test-token',
        })
        .expect(200);
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: person.email,
          password: person.password,
          captchaToken: 'test-token',
        })
        .expect(401);

      // Single-use: the same link again is refused.
      await request(app.getHttpServer())
        .post('/auth/confirm-email-change')
        .send({ token })
        .expect(400);
    });

    it('refuses a wrong current password with a 403 and sends nothing', async () => {
      const person = await integration.createUser({ role: 'editor' });
      const here = await signedInFrom(person);
      const newEmail = unique();

      await here
        .post('/account/email-change')
        .send({ newEmail, currentPassword: 'not-it' })
        .expect(403);

      expect(await countEmailsTo(newEmail)).toBe(0);
    });

    it('refuses an address somebody else has, with a 409, and sends nothing', async () => {
      const person = await integration.createUser({ role: 'editor' });
      const other = await integration.createUser({ role: 'editor' });
      const here = await signedInFrom(person);

      await here
        .post('/account/email-change')
        .send({ newEmail: other.email, currentPassword: person.password })
        .expect(409);

      expect(await countEmailsTo(other.email)).toBe(0);
    });

    it('refuses the address the account already has, and one that is not an address', async () => {
      const person = await integration.createUser({ role: 'editor' });
      const here = await signedInFrom(person);

      await here
        .post('/account/email-change')
        .send({ newEmail: person.email, currentPassword: person.password })
        .expect(400);
      const res = await here
        .post('/account/email-change')
        .send({ newEmail: 'not an address', currentPassword: person.password })
        .expect(400);
      expect(res.body.fieldErrors.newEmail).toHaveLength(1);
    });

    it('refuses a link that was never issued', async () => {
      await request(app.getHttpServer())
        .post('/auth/confirm-email-change')
        .send({ token: 'not-a-real-token' })
        .expect(400);
    });

    it('refuses a link when somebody took the address in the meantime, and keeps the old one', async () => {
      const person = await integration.createUser({ role: 'editor' });
      const here = await signedInFrom(person);
      const newEmail = unique();
      await here
        .post('/account/email-change')
        .send({ newEmail, currentPassword: person.password })
        .expect(204);
      const token = await fetchEmailedToken(newEmail, 'changeToken');
      await integration.createUser({ role: 'editor', email: newEmail });

      await request(app.getHttpServer())
        .post('/auth/confirm-email-change')
        .send({ token })
        .expect(409);

      expect((await here.get('/account/profile').expect(200)).body.email).toBe(
        person.email,
      );
    });
  });
});
