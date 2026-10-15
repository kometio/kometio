import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { FakeSecretCipher } from '@kometio/testing';
import { SECRET_CIPHER } from '../adapters/port.tokens';
import { SESSION_COOKIE_NAME } from '../auth/session-cookies';
import {
  IntegrationApp,
  type IntegrationUser,
} from '../../test/integration-app.test-fixture';
import { totpCodeAt } from '../../test/totp.test-fixture';
import { UsersModule } from '../users/users.module';
import { AccountModule } from './account.module';

/**
 * The second step of a sign-in over real HTTP and a real Postgres
 * (docs/adr/0137): turning it on, signing in with it, the recovery codes, and
 * an administrator taking it off. The cipher is a fake that seals reversibly:
 * what the real one does is its own spec's, and a deployment's key is not
 * this suite's to make.
 */
describe('Second step of sign-in (integration)', () => {
  let integration: IntegrationApp;
  let app: INestApplication;

  beforeAll(async () => {
    integration = await IntegrationApp.start({
      imports: [AccountModule, UsersModule],
      // One proxy in front: each sign-in comes from an address of its own, and
      // not all from this machine, which the login limit (five a minute) would
      // stop at the sixth.
      trustedProxyHops: 1,
      overrideProviders: (builder) =>
        builder
          .overrideProvider(SECRET_CIPHER)
          .useValue(new FakeSecretCipher()),
    });
    app = integration.app;
  });

  afterAll(async () => {
    await integration.close();
  });

  let sign = 0;
  /** A client of its own: every request from its own address, as a device is. */
  function client(): ReturnType<typeof request.agent> {
    sign += 1;
    return request
      .agent(app.getHttpServer())
      .set('X-Forwarded-For', `10.0.${sign}.${sign}`);
  }

  async function signInWithPasswordOnly(user: IntegrationUser) {
    const agent = client();
    await agent
      .post('/auth/login')
      .send({ email: user.email, password: user.password, captchaToken: 'x' })
      .expect(200);
    return agent;
  }

  /** A person who has turned it on: their secret, and the codes they were shown. */
  async function personWithSecondFactor(role: 'editor' | 'admin' = 'editor') {
    const user = await integration.createUser({ role });
    const agent = await signInWithPasswordOnly(user);
    const begun = await agent
      .post('/account/second-factor/begin')
      .send({ password: user.password })
      .expect(200);
    const secret: string = begun.body.secret;
    const confirmed = await agent
      .post('/account/second-factor/confirm')
      .send({ code: totpCodeAt(secret, new Date()) })
      .expect(200);
    const recoveryCodes: string[] = confirmed.body.recoveryCodes;
    return { user, agent, secret, recoveryCodes };
  }

  /** The code of the step after this one: the one a first sign-in does not reuse. */
  const nextStep = () => new Date(Date.now() + 30_000);

  it('refuses anyone without a session', async () => {
    await request(app.getHttpServer())
      .get('/account/second-factor')
      .expect(401);
    await request(app.getHttpServer())
      .post('/account/second-factor/begin')
      .send({ password: 'x' })
      .expect(401);
  });

  it('is off for somebody who never turned it on, and offered', async () => {
    const user = await integration.createUser({ role: 'editor' });
    const agent = await signInWithPasswordOnly(user);

    const status = await agent.get('/account/second-factor').expect(200);

    expect(status.body).toEqual({
      available: true,
      enabled: false,
      recoveryCodesLeft: 0,
    });
  });

  it('asks for the password again before it makes a secret', async () => {
    const user = await integration.createUser({ role: 'editor' });
    const agent = await signInWithPasswordOnly(user);

    await agent
      .post('/account/second-factor/begin')
      .send({ password: 'not-the-password' })
      .expect(403);
  });

  it('shows the secret once, with no cache, and is not on until a code fits', async () => {
    const user = await integration.createUser({ role: 'editor' });
    const agent = await signInWithPasswordOnly(user);

    const begun = await agent
      .post('/account/second-factor/begin')
      .send({ password: user.password })
      .expect(200);

    expect(begun.headers['cache-control']).toContain('no-store');
    expect(begun.body.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(begun.body.provisioningUri).toContain('otpauth://totp/');
    expect(begun.body.provisioningUri).toContain(begun.body.secret);
    // Pending is not on: the next sign-in is the password alone.
    expect(
      (await agent.get('/account/second-factor').expect(200)).body.enabled,
    ).toBe(false);
    await agent
      .post('/account/second-factor/confirm')
      .send({ code: '000000' })
      .expect(400);
    expect(
      (await agent.get('/account/second-factor').expect(200)).body.enabled,
    ).toBe(false);
  });

  it('turns on with a code that fits, and gives ten recovery codes', async () => {
    const { agent, recoveryCodes } = await personWithSecondFactor();

    expect(recoveryCodes).toHaveLength(10);
    expect(recoveryCodes[0]).toMatch(/^[2-9a-hjkmnp-z]{5}-[2-9a-hjkmnp-z]{5}$/);
    expect(
      (await agent.get('/account/second-factor').expect(200)).body,
    ).toEqual({ available: true, enabled: true, recoveryCodesLeft: 10 });
  });

  it('does not sign in on the password alone: a challenge, and no cookie', async () => {
    const { user } = await personWithSecondFactor();

    const res = await client()
      .post('/auth/login')
      .send({ email: user.email, password: user.password, captchaToken: 'x' })
      .expect(200);

    expect(res.body.secondFactorRequired).toBe(true);
    expect(res.body.challenge).toEqual(expect.any(String));
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('signs in with the code, and the session works', async () => {
    const { user, secret } = await personWithSecondFactor();
    const agent = client();
    const first = await agent
      .post('/auth/login')
      .send({ email: user.email, password: user.password, captchaToken: 'x' })
      .expect(200);

    const done = await agent
      .post('/auth/login/second-factor')
      .send({
        challenge: first.body.challenge,
        code: totpCodeAt(secret, nextStep()),
      })
      .expect(200);

    expect(done.body.userId).toBe(user.id);
    expect([done.headers['set-cookie']].flat().join(';')).toContain(
      SESSION_COOKIE_NAME,
    );
    await agent.get('/auth/session').expect(200);
  });

  it('answers a wrong code with a fresh challenge, and the right one signs in', async () => {
    const { user, secret } = await personWithSecondFactor();
    const agent = client();
    const first = await agent
      .post('/auth/login')
      .send({ email: user.email, password: user.password, captchaToken: 'x' })
      .expect(200);

    const wrong = await agent
      .post('/auth/login/second-factor')
      .send({ challenge: first.body.challenge, code: '000000' })
      .expect(401);
    expect(wrong.body.challenge).toEqual(expect.any(String));
    expect(wrong.headers['set-cookie']).toBeUndefined();

    await agent
      .post('/auth/login/second-factor')
      .send({
        challenge: wrong.body.challenge,
        code: totpCodeAt(secret, nextStep()),
      })
      .expect(200);
  });

  it('spends a challenge when it is read: the same one cannot be answered twice', async () => {
    const { user, secret } = await personWithSecondFactor();
    const agent = client();
    const first = await agent
      .post('/auth/login')
      .send({ email: user.email, password: user.password, captchaToken: 'x' })
      .expect(200);
    const body = {
      challenge: first.body.challenge,
      code: totpCodeAt(secret, nextStep()),
    };
    await agent.post('/auth/login/second-factor').send(body).expect(200);

    const again = await client()
      .post('/auth/login/second-factor')
      .send(body)
      .expect(401);

    expect(again.body.challenge).toBeUndefined();
  });

  it('refuses a code that was already used, even with a new challenge', async () => {
    const { user, secret } = await personWithSecondFactor();
    const code = totpCodeAt(secret, nextStep());
    for (const expected of [200, 401]) {
      const agent = client();
      const first = await agent
        .post('/auth/login')
        .send({
          email: user.email,
          password: user.password,
          captchaToken: 'x',
        })
        .expect(200);
      await agent
        .post('/auth/login/second-factor')
        .send({ challenge: first.body.challenge, code })
        .expect(expected);
    }
  });

  it('takes a recovery code once, and counts what is left', async () => {
    const {
      user,
      agent: owner,
      recoveryCodes,
    } = await personWithSecondFactor();
    const first = await client()
      .post('/auth/login')
      .send({ email: user.email, password: user.password, captchaToken: 'x' })
      .expect(200);

    const done = await client()
      .post('/auth/login/second-factor')
      .send({ challenge: first.body.challenge, code: recoveryCodes[0] })
      .expect(200);

    expect(done.body.recoveryCodesLeft).toBe(9);
    // Written down with a capital and a space instead of the hyphen, it is
    // the same code; it has been spent.
    const second = await client()
      .post('/auth/login')
      .send({ email: user.email, password: user.password, captchaToken: 'x' })
      .expect(200);
    await client()
      .post('/auth/login/second-factor')
      .send({
        challenge: second.body.challenge,
        code: (recoveryCodes[0] ?? '').toUpperCase().replace('-', ' '),
      })
      .expect(401);
    expect(
      (await owner.get('/account/second-factor').expect(200)).body
        .recoveryCodesLeft,
    ).toBe(9);
  });

  it('makes new recovery codes with the password, and the old ones stop', async () => {
    const { user, agent, recoveryCodes } = await personWithSecondFactor();

    await agent
      .post('/account/second-factor/recovery-codes')
      .send({ password: 'not-the-password' })
      .expect(403);
    const fresh = await agent
      .post('/account/second-factor/recovery-codes')
      .send({ password: user.password })
      .expect(200);
    expect(fresh.body.recoveryCodes).toHaveLength(10);

    const challenge = await client()
      .post('/auth/login')
      .send({ email: user.email, password: user.password, captchaToken: 'x' })
      .expect(200);
    await client()
      .post('/auth/login/second-factor')
      .send({ challenge: challenge.body.challenge, code: recoveryCodes[0] })
      .expect(401);
  });

  it('turns off with the password, and the next sign-in is the password alone', async () => {
    const { user, agent } = await personWithSecondFactor();

    await agent
      .post('/account/second-factor/disable')
      .send({ password: 'not-the-password' })
      .expect(403);
    await agent
      .post('/account/second-factor/disable')
      .send({ password: user.password })
      .expect(204);

    const res = await client()
      .post('/auth/login')
      .send({ email: user.email, password: user.password, captchaToken: 'x' })
      .expect(200);
    expect(res.body.userId).toBe(user.id);
  });

  it('ends the other sessions when it is turned on', async () => {
    const user = await integration.createUser({ role: 'editor' });
    const here = await signInWithPasswordOnly(user);
    const elsewhere = await signInWithPasswordOnly(user);
    const begun = await here
      .post('/account/second-factor/begin')
      .send({ password: user.password })
      .expect(200);

    await here
      .post('/account/second-factor/confirm')
      .send({ code: totpCodeAt(begun.body.secret, new Date()) })
      .expect(200);

    await here.get('/auth/session').expect(200);
    await elsewhere.get('/auth/session').expect(401);
  });

  describe('an administrator', () => {
    it('sees who has it, and takes it off a person who lost the app', async () => {
      const person = await personWithSecondFactor('editor');
      const admin = await integration.createUser({ role: 'admin' });
      const adminAgent = await signInWithPasswordOnly(admin);

      const list = await adminAgent
        .get('/users?page=1&pageSize=100')
        .expect(200);
      const row = list.body.items.find(
        (item: { id: string }) => item.id === person.user.id,
      );
      expect(row.twoFactorEnabled).toBe(true);

      await adminAgent
        .post(`/users/${person.user.id}/second-factor/reset`)
        .expect(204);

      // Their devices are signed out, and the password alone signs them in.
      await person.agent.get('/auth/session').expect(401);
      const res = await client()
        .post('/auth/login')
        .send({
          email: person.user.email,
          password: person.user.password,
          captchaToken: 'x',
        })
        .expect(200);
      expect(res.body.userId).toBe(person.user.id);
      const after = await adminAgent
        .get('/users?page=1&pageSize=100')
        .expect(200);
      expect(
        after.body.items.find(
          (item: { id: string }) => item.id === person.user.id,
        ).twoFactorEnabled,
      ).toBe(false);
    });

    it('is the only one who may: an editor is refused', async () => {
      const person = await personWithSecondFactor('editor');
      const other = await integration.createUser({ role: 'editor' });
      const otherAgent = await signInWithPasswordOnly(other);

      await otherAgent
        .post(`/users/${person.user.id}/second-factor/reset`)
        .expect(403);
    });
  });
});
