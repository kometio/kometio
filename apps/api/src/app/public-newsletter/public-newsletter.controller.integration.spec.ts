import request from 'supertest';
import type { NewsletterPort } from '@kometio/ports';
import { IntegrationApp } from '../../test/integration-app.test-fixture';
import { ServedSite } from '../../test/served-site.test-fixture';
import { NEWSLETTER_PORT } from '../adapters/port.tokens';
import { AuthModule } from '../auth/auth.module';
import { SitesModule } from '../sites/sites.module';
import { PublicNewsletterModule } from './public-newsletter.module';

// No real Mailchimp/Brevo calls in tests — same "don't depend on a live third
// party's uptime" reasoning as public-forms.controller.integration.spec.ts. The
// captcha is the fake the fixture puts in, which takes any token that is not
// empty: the proof of work has specs of its own.
class RecordingNewsletterPort implements NewsletterPort {
  readonly subscribedEmails: string[] = [];
  async subscribe(email: string): Promise<void> {
    this.subscribedEmails.push(email);
  }
}

/** Runs against a real Postgres — see docs/development.md. */
describe('PublicNewsletterController (integration)', () => {
  let integration: IntegrationApp;
  let newsletterPort: RecordingNewsletterPort;
  const served = new ServedSite();

  beforeAll(async () => {
    newsletterPort = new RecordingNewsletterPort();
    integration = await IntegrationApp.start({
      imports: [PublicNewsletterModule, AuthModule, SitesModule],
      overrideProviders: (builder) =>
        served.pinIn(
          builder.overrideProvider(NEWSLETTER_PORT).useValue(newsletterPort),
        ),
    });
    served.siteId = await integration.createSite();
  });

  afterAll(async () => {
    await integration.close();
  });

  const subscribe = (body: object) =>
    request(integration.app.getHttpServer())
      .post('/public/newsletter/subscribe')
      .send(body);

  it('subscribes a valid email', async () => {
    await subscribe({
      email: 'visitor@example.com',
      captchaToken: 'test-token',
    }).expect(204);

    expect(newsletterPort.subscribedEmails).toContain('visitor@example.com');
  });

  it('400s an invalid email address', async () => {
    await subscribe({
      email: 'not-an-email',
      captchaToken: 'test-token',
    }).expect(400);
  });

  it('400s a missing or invalid CAPTCHA token', async () => {
    await subscribe({ email: 'visitor2@example.com' }).expect(400);

    expect(newsletterPort.subscribedEmails).not.toContain(
      'visitor2@example.com',
    );
  });

  it('silently accepts a honeypot-filled submission (204, not a distinguishing rejection)', async () => {
    await subscribe({
      email: 'bot@example.com',
      honeypot: 'i-am-a-bot',
      captchaToken: 'test-token',
    }).expect(204);

    expect(newsletterPort.subscribedEmails).not.toContain('bot@example.com');
  });

  describe('once the owner has turned the captcha of the signup off (docs/adr/0145)', () => {
    beforeAll(async () => {
      const owner = await integration.login(await integration.createUser());
      await owner
        .patch(`/sites/${served.siteId}/newsletter-captcha`)
        .send({ newsletterCaptchaEnabled: false })
        .expect(200);
    });

    it('subscribes an email with no solution at all', async () => {
      await subscribe({ email: 'no-captcha@example.com' }).expect(204);

      expect(newsletterPort.subscribedEmails).toContain(
        'no-captcha@example.com',
      );
    });

    it('still drops what the honeypot catches', async () => {
      await subscribe({
        email: 'bot-no-captcha@example.com',
        honeypot: 'i-am-a-bot',
      }).expect(204);

      expect(newsletterPort.subscribedEmails).not.toContain(
        'bot-no-captcha@example.com',
      );
    });
  });
});
