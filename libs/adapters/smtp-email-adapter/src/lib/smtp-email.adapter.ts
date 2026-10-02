import { createTransport, type Transporter } from 'nodemailer';
import type { EmailMessage, EmailPort } from '@kometio/ports';

export interface SmtpConfig {
  host: string;
  port: number;
  fromAddress: string;
  /** Mailpit (local dev) needs neither — see docs/development.md. */
  user?: string;
  password?: string;
}

/** Generic SMTP — no vendor lock-in, works against Mailpit locally and any real provider in production. */
export class SmtpEmailAdapter implements EmailPort {
  private readonly transporter: Transporter;

  constructor(private readonly config: SmtpConfig) {
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth:
        config.user && config.password
          ? { user: config.user, pass: config.password }
          : undefined,
    });
  }

  async sendEmail(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.fromAddress,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }
}
