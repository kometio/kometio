import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from './users.module';
import { IntegrationApp } from '../../test/integration-app.test-fixture';
import {
  fetchEmailedToken,
  subjectsOfEmailsTo,
  waitForMessageCount,
} from '../../test/mailpit.test-fixture';
import type { UserRepositoryPort } from '@kometio/ports';
import { USER_REPOSITORY } from '../adapters/port.tokens';

/** The invite link's token, out of the mail Mailpit received. */
const fetchInviteToken = (toEmail: string) =>
  fetchEmailedToken(toEmail, 'inviteToken');

// 'resends the invite' below chains THREE of the mailbox waits back to
// back, so this file's Jest timeout has to clear their combined worst case
// with room to spare — 3 x EMAIL_DELIVERY_TIMEOUT_MS
// (mailpit.test-fixture.ts), plus the real HTTP/Postgres/SMTP work around
// them. Keep the two numbers in step: a per-poll budget that outgrows this
// one turns an honest "no email arrived" into a bare Jest timeout, which
// says nothing about why.
jest.setTimeout(60_000);

/**
 * Runs the full invite -> accept-invite cycle through the real HTTP stack,
 * a real Postgres, and a real SMTP relay (Mailpit in dev, see
 * docs/development.md) — same "real infra, not mocks" reasoning as
 * public-forms.controller.integration.spec.ts. Reads the actual invite
 * link out of Mailpit's own HTTP API instead of reaching into
 * VerificationTokenPort directly: only the token's SHA-256 hash is ever
 * persisted (see VerificationTokenAdapter), so the raw token genuinely
 * only exists in the email that was sent — polling Mailpit is the only
 * way to test the real, user-facing path end to end.
 */
describe('Invite -> accept-invite (integration)', () => {
  let integration: IntegrationApp;
  let app: INestApplication;
  let adminAgent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    integration = await IntegrationApp.start({
      imports: [UsersModule, AuthModule],
    });
    app = integration.app;
    adminAgent = await integration.login(
      await integration.createUser({ displayName: 'Invite Flow Admin' }),
    );
  });

  afterAll(async () => {
    await integration.close();
  });

  it('invites a user, accepts the invite from the emailed link, and logs in with the new password', async () => {
    const inviteeEmail = `invitee-${randomUUID()}@example.test`;

    const inviteRes = await adminAgent
      .post('/users/invite')
      .send({
        email: inviteeEmail,
        displayName: 'Nuovo Utente',
        role: 'editor',
      })
      .expect(201);
    expect(inviteRes.body.isActive).toBe(false);
    // Waiting to join, and the list can tell that from an admin's switch-off.
    expect(inviteRes.body.invitePending).toBe(true);
    integration.trackUser(inviteRes.body.id);

    const inviteToken = await fetchInviteToken(inviteeEmail);
    const newPassword = 'a-brand-new-password';

    await request(app.getHttpServer())
      .post('/auth/accept-invite')
      .send({ token: inviteToken, password: newPassword })
      .expect(200);

    const listRes = await adminAgent
      .get('/users')
      .query({ pageSize: 100 })
      .expect(200);
    const accepted = listRes.body.items.find(
      (u: { email: string }) => u.email === inviteeEmail,
    );
    expect(accepted.isActive).toBe(true);
    expect(accepted.invitePending).toBe(false);

    // Typed in capitals: an address is the same address whatever its case.
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: inviteeEmail.toUpperCase(),
        password: newPassword,
        captchaToken: 'test-token',
      })
      .expect(200);
    expect(loginRes.body.userId).toBe(inviteRes.body.id);
  });

  it.each([
    ['it', 'Sei stato invitato su Kometio'],
    ['en', 'You have been invited to Kometio'],
  ] as const)(
    "writes the invitation in the language the inviter chose (%s), and keeps it as the invitee's own",
    async (language, subject) => {
      const inviteeEmail = `invitee-${randomUUID()}@example.test`;

      const res = await adminAgent
        .post('/users/invite')
        .send({
          email: inviteeEmail,
          displayName: 'Nuovo Utente',
          role: 'editor',
          language,
        })
        .expect(201);
      integration.trackUser(res.body.id);

      await waitForMessageCount(inviteeEmail, 1);
      expect(await subjectsOfEmailsTo(inviteeEmail)).toEqual([subject]);
      const stored = await app
        .get<UserRepositoryPort>(USER_REPOSITORY)
        .findById(integration.tenantId, res.body.id);
      expect(stored?.language).toBe(language);
      // The users list says it, so an admin can see who is written to in what.
      const list = await adminAgent
        .get('/users')
        .query({ pageSize: 100 })
        .expect(200);
      expect(
        list.body.items.find((u: { id: string }) => u.id === res.body.id)
          .language,
      ).toBe(language);
    },
  );

  it('400s an invitation in a language the emails are not written in', async () => {
    await adminAgent
      .post('/users/invite')
      .send({
        email: `invitee-${randomUUID()}@example.test`,
        displayName: 'Nuovo Utente',
        role: 'editor',
        language: 'fr',
      })
      .expect(400);
  });

  it('409s inviting an address that differs from an existing one only by case', async () => {
    const inviteeEmail = `Case-${randomUUID()}@Example.test`;
    const first = await adminAgent
      .post('/users/invite')
      .send({ email: inviteeEmail, displayName: 'Primo', role: 'editor' })
      .expect(201);
    integration.trackUser(first.body.id);

    await adminAgent
      .post('/users/invite')
      .send({
        email: inviteeEmail.toLowerCase(),
        displayName: 'Secondo',
        role: 'editor',
      })
      .expect(409);
  });

  it('400s accepting an invite twice — the token is single-use', async () => {
    const inviteeEmail = `invitee-${randomUUID()}@example.test`;
    const inviteRes = await adminAgent
      .post('/users/invite')
      .send({
        email: inviteeEmail,
        displayName: 'Utente Singolo Uso',
        role: 'editor',
      })
      .expect(201);
    integration.trackUser(inviteRes.body.id);
    const inviteToken = await fetchInviteToken(inviteeEmail);

    await request(app.getHttpServer())
      .post('/auth/accept-invite')
      .send({ token: inviteToken, password: 'first-password' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/accept-invite')
      .send({ token: inviteToken, password: 'second-password' })
      .expect(400);
  });

  it('400s accepting an invite with a garbage token', async () => {
    await request(app.getHttpServer())
      .post('/auth/accept-invite')
      .send({ token: 'not-a-real-token', password: 'irrelevant-password' })
      .expect(400);
  });

  it('403s a non-admin inviting a user', async () => {
    const editorAgent = await integration.login(
      await integration.createUser({
        role: 'editor',
        displayName: 'Invite Flow Editor',
      }),
    );

    await editorAgent
      .post('/users/invite')
      .send({
        email: `should-not-be-invited-${randomUUID()}@example.test`,
        displayName: 'Non dovrebbe esistere',
        role: 'editor',
      })
      .expect(403);
  });

  it('re-sends the invite with a fresh, still-working token', async () => {
    const inviteeEmail = `invitee-${randomUUID()}@example.test`;
    const inviteRes = await adminAgent
      .post('/users/invite')
      .send({
        email: inviteeEmail,
        displayName: 'Da Re-invitare',
        role: 'editor',
      })
      .expect(201);
    integration.trackUser(inviteRes.body.id);
    await fetchInviteToken(inviteeEmail);

    await adminAgent
      .post(`/users/${inviteRes.body.id}/resend-invite`)
      .expect(200);
    await waitForMessageCount(inviteeEmail, 2);

    const freshToken = await fetchInviteToken(inviteeEmail);
    await request(app.getHttpServer())
      .post('/auth/accept-invite')
      .send({ token: freshToken, password: 'fresh-password' })
      .expect(200);
  });

  it('409s resending an invite to a user who already accepted it', async () => {
    const inviteeEmail = `invitee-${randomUUID()}@example.test`;
    const inviteRes = await adminAgent
      .post('/users/invite')
      .send({
        email: inviteeEmail,
        displayName: 'Attivo Subito',
        role: 'editor',
      })
      .expect(201);
    integration.trackUser(inviteRes.body.id);
    const inviteToken = await fetchInviteToken(inviteeEmail);
    await request(app.getHttpServer())
      .post('/auth/accept-invite')
      .send({ token: inviteToken, password: 'a-password' })
      .expect(200);

    await adminAgent
      .post(`/users/${inviteRes.body.id}/resend-invite`)
      .expect(409);
  });

  it('409s inviting an email that already belongs to a user', async () => {
    const inviteeEmail = `invitee-${randomUUID()}@example.test`;
    const inviteRes = await adminAgent
      .post('/users/invite')
      .send({ email: inviteeEmail, displayName: 'Prima Volta', role: 'editor' })
      .expect(201);
    integration.trackUser(inviteRes.body.id);

    await adminAgent
      .post('/users/invite')
      .send({
        email: inviteeEmail,
        displayName: 'Seconda Volta',
        role: 'editor',
      })
      .expect(409);
  });

  describe('withdrawing an invitation', () => {
    async function invite(displayName: string) {
      const email = `invitee-${randomUUID()}@example.test`;
      const res = await adminAgent
        .post('/users/invite')
        .send({ email, displayName, role: 'editor' })
        .expect(201);
      integration.trackUser(res.body.id);
      return { email, id: res.body.id as string };
    }

    it('cancels one nobody has accepted: the person is gone and the link no longer works', async () => {
      const invitee = await invite('Da Annullare');
      const inviteToken = await fetchInviteToken(invitee.email);

      await adminAgent.delete(`/users/${invitee.id}/invite`).expect(204);

      const list = await adminAgent
        .get('/users')
        .query({ pageSize: 100 })
        .expect(200);
      expect(
        list.body.items.some((u: { id: string }) => u.id === invitee.id),
      ).toBe(false);
      await request(app.getHttpServer())
        .post('/auth/accept-invite')
        .send({ token: inviteToken, password: 'too-late-password' })
        .expect(400);
      // Nothing is left to block the address: it can be invited again.
      await adminAgent
        .post('/users/invite')
        .send({
          email: invitee.email,
          displayName: 'Di Nuovo',
          role: 'editor',
        })
        .expect(201)
        .then((res) => integration.trackUser(res.body.id));
    });

    it('409s cancelling one that was accepted — that person is a user now', async () => {
      const invitee = await invite('Già Accettato');
      const inviteToken = await fetchInviteToken(invitee.email);
      await request(app.getHttpServer())
        .post('/auth/accept-invite')
        .send({ token: inviteToken, password: 'a-good-password' })
        .expect(200);

      await adminAgent.delete(`/users/${invitee.id}/invite`).expect(409);

      const list = await adminAgent
        .get('/users')
        .query({ pageSize: 100 })
        .expect(200);
      expect(
        list.body.items.some((u: { id: string }) => u.id === invitee.id),
      ).toBe(true);
    });

    it('404s cancelling an invitation that does not exist', async () => {
      await adminAgent.delete(`/users/${randomUUID()}/invite`).expect(404);
    });

    it('409s switching on somebody who has not accepted', async () => {
      const invitee = await invite('Non Ancora');

      await adminAgent
        .patch(`/users/${invitee.id}/active`)
        .send({ isActive: true })
        .expect(409);
    });

    it('403s an editor cancelling one', async () => {
      const invitee = await invite('Non Tuo');
      const editorAgent = await integration.login(
        await integration.createUser({
          role: 'editor',
          displayName: 'Cancel Flow Editor',
        }),
      );

      await editorAgent.delete(`/users/${invitee.id}/invite`).expect(403);
    });
  });
});
