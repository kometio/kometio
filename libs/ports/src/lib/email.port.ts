export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Implemented by @kometio/smtp-email-adapter — generic SMTP, no vendor lock-in. */
export interface EmailPort {
  /**
   * Whether what is sent reaches the person it is sent to. False for the
   * adapter of a server with no mail server, which writes the message where
   * whoever runs the server will look (docs/adr/0103): an email that carries
   * a link only its recipient should have is not sent through it, and the
   * link is given to someone who can pass it on.
   */
  readonly delivers: boolean;
  sendEmail(message: EmailMessage): Promise<void>;
}
