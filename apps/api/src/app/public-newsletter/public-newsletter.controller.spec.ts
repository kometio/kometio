import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { CaptchaPort, NewsletterPort } from '@kometio/ports';
import { PublicNewsletterModule } from './public-newsletter.module';
import { HttpExceptionFilter } from '../http-exception.filter';
import { CAPTCHA_PORT, NEWSLETTER_PORT } from '../adapters/port.tokens';

// No real Cloudflare/Mailchimp/Brevo calls in tests — same "don't depend on
// a live third party's uptime" reasoning as
// public-forms.controller.integration.spec.ts's own FakeCaptchaPort.
class FakeCaptchaPort implements CaptchaPort {
  async verify({ token }: { token: string }): Promise<boolean> {
    return token.trim() !== '';
  }
}

class RecordingNewsletterPort implements NewsletterPort {
  readonly subscribedEmails: string[] = [];
  async subscribe(email: string): Promise<void> {
    this.subscribedEmails.push(email);
  }
}

describe('PublicNewsletterController', () => {
  let app: INestApplication;
  let newsletterPort: RecordingNewsletterPort;

  beforeAll(async () => {
    newsletterPort = new RecordingNewsletterPort();
    const moduleRef = await Test.createTestingModule({
      imports: [PublicNewsletterModule],
    })
      .overrideProvider(CAPTCHA_PORT)
      .useClass(FakeCaptchaPort)
      .overrideProvider(NEWSLETTER_PORT)
      .useValue(newsletterPort)
      .compile();

    app = moduleRef.createNestApplication();
    // As main.ts does: a domain error is answered by the one global table.
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('subscribes a valid email', async () => {
    await request(app.getHttpServer())
      .post('/public/newsletter/subscribe')
      .send({ email: 'visitor@example.com', captchaToken: 'test-token' })
      .expect(204);

    expect(newsletterPort.subscribedEmails).toContain('visitor@example.com');
  });

  it('400s an invalid email address', async () => {
    await request(app.getHttpServer())
      .post('/public/newsletter/subscribe')
      .send({ email: 'not-an-email', captchaToken: 'test-token' })
      .expect(400);
  });

  it('400s a missing or invalid CAPTCHA token', async () => {
    await request(app.getHttpServer())
      .post('/public/newsletter/subscribe')
      .send({ email: 'visitor2@example.com' })
      .expect(400);

    expect(newsletterPort.subscribedEmails).not.toContain(
      'visitor2@example.com',
    );
  });

  it('silently accepts a honeypot-filled submission (204, not a distinguishing rejection)', async () => {
    await request(app.getHttpServer())
      .post('/public/newsletter/subscribe')
      .send({
        email: 'bot@example.com',
        honeypot: 'i-am-a-bot',
        captchaToken: 'test-token',
      })
      .expect(204);

    expect(newsletterPort.subscribedEmails).not.toContain('bot@example.com');
  });
});
