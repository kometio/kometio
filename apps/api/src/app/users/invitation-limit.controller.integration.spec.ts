import { randomUUID } from 'node:crypto';
import type request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { IntegrationApp } from '../../test/integration-app.test-fixture';
import { UsersModule } from './users.module';

jest.setTimeout(60_000);

/**
 * What one person may do through the invitation routes (docs/adr/0120), through
 * the real HTTP stack: that SessionAuthGuard puts the person where the limit
 * reads it, and that the limit is the person's and not the address's.
 *
 * It is a file of its own because it spends an hour's twenty: sharing an app
 * with invite-accept-invite's administrator would leave that file's own
 * tests one invitation from the limit.
 */
describe('Invitations per person (integration)', () => {
  let integration: IntegrationApp;
  let sender: ReturnType<typeof request.agent>;
  let other: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    integration = await IntegrationApp.start({
      imports: [UsersModule, AuthModule],
    });
    sender = await integration.login(
      await integration.createUser({ displayName: 'Invitation Limit Admin' }),
    );
    other = await integration.login(
      await integration.createUser({ displayName: 'Another Admin' }),
    );
  });

  afterAll(async () => {
    await integration.close();
  });

  it('stops an administrator at twenty in the hour, inviting and resending counted together, and leaves the next one their own twenty', async () => {
    const invited = await sender
      .post('/users/invite')
      .send({
        email: `invitee-${randomUUID()}@example.test`,
        displayName: 'Rinviato Troppo',
        role: 'editor',
      })
      .expect(201);
    integration.trackUser(invited.body.user.id);

    // The invitation was the first of the twenty, and a resend is one too.
    for (let sent = 2; sent <= 20; sent += 1) {
      await sender
        .post(`/users/${invited.body.user.id}/resend-invite`)
        .expect(200);
    }
    await sender
      .post(`/users/${invited.body.user.id}/resend-invite`)
      .expect(429);
    await sender
      .post('/users/invite')
      .send({
        email: `invitee-${randomUUID()}@example.test`,
        displayName: 'Uno In Più',
        role: 'editor',
      })
      .expect(429);

    // Both come from this machine's one address: it is the person that is counted.
    await other
      .post('/users/invite')
      .send({
        email: `invitee-${randomUUID()}@example.test`,
        displayName: 'Altro Invitante',
        role: 'editor',
      })
      .expect(201)
      .then((res) => integration.trackUser(res.body.user.id));
  });
});
