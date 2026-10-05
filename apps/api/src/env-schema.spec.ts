import { validateApiEnv } from './env-schema';

const VALID_ENV: NodeJS.ProcessEnv = {
  POSTGRES_APP_PASSWORD: 'app-password',
  DEFAULT_TENANT_ID: '31329174-2ede-4151-be9d-a3e765d21e1f',
  PREVIEW_TOKEN_SECRET: 'preview-secret',
  EDITOR_APP_URL: 'http://localhost:4200',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_FROM_ADDRESS: 'noreply@kometio.local',
  MEDIA_UPLOAD_DIR: './uploads',
  API_PUBLIC_URL: 'http://localhost:3000/api',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
  THEMES_DIR: './themes',
};

describe('validateApiEnv', () => {
  it('passes with only the always-required variables set (LocalDisk media, no newsletter provider)', () => {
    expect(() => validateApiEnv(VALID_ENV)).not.toThrow();
  });

  it('reports every missing variable in one error, not just the first', () => {
    expect(() => validateApiEnv({})).toThrow(
      /POSTGRES_APP_PASSWORD[\s\S]*PREVIEW_TOKEN_SECRET[\s\S]*EDITOR_APP_URL/,
    );
  });

  it('accepts a missing DEFAULT_TENANT_ID', () => {
    // Optional since the first-run wizard: a deployment that has never been
    // set up has no tenant to name, and DeploymentTenantResolver falls back
    // to the single row in `tenants`.
    expect(() =>
      validateApiEnv({ ...VALID_ENV, DEFAULT_TENANT_ID: undefined }),
    ).not.toThrow();
  });

  it('rejects a malformed DEFAULT_TENANT_ID (not a uuid)', () => {
    expect(() =>
      validateApiEnv({ ...VALID_ENV, DEFAULT_TENANT_ID: 'not-a-uuid' }),
    ).toThrow(/DEFAULT_TENANT_ID/);
  });

  it('does not require S3 variables when MEDIA_STORAGE_PROVIDER is unset (LocalDisk default)', () => {
    expect(() => validateApiEnv(VALID_ENV)).not.toThrow();
  });

  it('requires every S3 variable once MEDIA_STORAGE_PROVIDER=s3', () => {
    expect(() =>
      validateApiEnv({ ...VALID_ENV, MEDIA_STORAGE_PROVIDER: 's3' }),
    ).toThrow(/S3_MEDIA_BUCKET[\s\S]*S3_MEDIA_REGION/);
  });

  it('passes with MEDIA_STORAGE_PROVIDER=s3 once all S3 variables are set', () => {
    expect(() =>
      validateApiEnv({
        ...VALID_ENV,
        MEDIA_STORAGE_PROVIDER: 's3',
        S3_MEDIA_BUCKET: 'kometio-media',
        S3_MEDIA_REGION: 'us-east-1',
        S3_MEDIA_ACCESS_KEY_ID: 'key',
        S3_MEDIA_SECRET_ACCESS_KEY: 'secret',
        S3_MEDIA_PUBLIC_BASE_URL: 'http://localhost:9000/kometio-media',
      }),
    ).not.toThrow();
  });

  it('requires MAILCHIMP_API_KEY/MAILCHIMP_AUDIENCE_ID once NEWSLETTER_PROVIDER=mailchimp', () => {
    expect(() =>
      validateApiEnv({ ...VALID_ENV, NEWSLETTER_PROVIDER: 'mailchimp' }),
    ).toThrow(/MAILCHIMP_API_KEY[\s\S]*MAILCHIMP_AUDIENCE_ID/);
  });

  it('requires BREVO_API_KEY/BREVO_LIST_ID once NEWSLETTER_PROVIDER=brevo', () => {
    expect(() =>
      validateApiEnv({ ...VALID_ENV, NEWSLETTER_PROVIDER: 'brevo' }),
    ).toThrow(/BREVO_API_KEY[\s\S]*BREVO_LIST_ID/);
  });

  /*
   * A deployment with no mail server is a real one: a freelancer's first server
   * has no SMTP account yet. It writes its emails to the log (docs/adr/0103)
   * instead of refusing to start.
   */
  describe('the mail server', () => {
    const { SMTP_HOST, SMTP_PORT, SMTP_FROM_ADDRESS, ...WITHOUT_SMTP } =
      VALID_ENV;
    void [SMTP_HOST, SMTP_PORT, SMTP_FROM_ADDRESS];

    it('is optional: without SMTP_HOST the API starts', () => {
      expect(() => validateApiEnv(WITHOUT_SMTP)).not.toThrow();
    });

    it('reads an empty SMTP_HOST as not set, which is how an example file leaves it', () => {
      expect(() =>
        validateApiEnv({
          ...WITHOUT_SMTP,
          SMTP_HOST: '',
          SMTP_PORT: '587',
          SMTP_FROM_ADDRESS: 'noreply@example.com',
        }),
      ).not.toThrow();
    });

    it('asks for the port and the sender once a host is given', () => {
      expect(() =>
        validateApiEnv({ ...WITHOUT_SMTP, SMTP_HOST: 'mail.example.test' }),
      ).toThrow(/SMTP_PORT[\s\S]*SMTP_FROM_ADDRESS/);
    });

    it('starts in production without one too', () => {
      expect(() =>
        validateApiEnv({
          ...WITHOUT_SMTP,
          NODE_ENV: 'production',
          POSTGRES_APP_PASSWORD: 'a-real-database-password',
          PREVIEW_TOKEN_SECRET: 'a'.repeat(64),
          TURNSTILE_SECRET_KEY: '0x4AAAAAAAInventedRealLookingKey',
        }),
      ).not.toThrow();
    });
  });

  it('reads an empty PUBLIC_API_SERVICE_TOKEN as not set, as .env.example leaves it', () => {
    // It said "left empty, nothing changes", and the schema refused the empty
    // string: a copied example did not start.
    expect(() =>
      validateApiEnv({ ...VALID_ENV, PUBLIC_API_SERVICE_TOKEN: '' }),
    ).not.toThrow();
  });

  describe('in the production image', () => {
    const PRODUCTION: NodeJS.ProcessEnv = {
      ...VALID_ENV,
      NODE_ENV: 'production',
      POSTGRES_APP_PASSWORD: 'a-real-database-password',
      PREVIEW_TOKEN_SECRET: 'a'.repeat(64),
      PUBLIC_API_SERVICE_TOKEN: 'b'.repeat(64),
      TURNSTILE_SECRET_KEY: '0x4AAAAAAAInventedRealLookingKey',
    };

    it('starts with real values', () => {
      expect(() => validateApiEnv(PRODUCTION)).not.toThrow();
    });

    it('refuses what a copied example leaves behind', () => {
      for (const [key, value, message] of [
        ['SMTP_PASSWORD', 'CHANGE_ME', /SMTP_PASSWORD is still CHANGE_ME/],
        [
          'PREVIEW_TOKEN_SECRET',
          'short',
          /PREVIEW_TOKEN_SECRET must be at least 32/,
        ],
        [
          'PUBLIC_API_SERVICE_TOKEN',
          'short',
          /PUBLIC_API_SERVICE_TOKEN must be at least 32/,
        ],
        [
          'POSTGRES_APP_PASSWORD',
          'app-password',
          /POSTGRES_APP_PASSWORD must be at least 16/,
        ],
        [
          'TURNSTILE_SECRET_KEY',
          '1x0000000000000000000000000000000AA',
          /TURNSTILE_SECRET_KEY is a Cloudflare test key/,
        ],
        [
          'TURNSTILE_SECRET_KEY',
          '2x0000000000000000000000000000000AA',
          /TURNSTILE_SECRET_KEY is a Cloudflare test key/,
        ],
      ] as const) {
        expect(() => validateApiEnv({ ...PRODUCTION, [key]: value })).toThrow(
          message,
        );
      }
    });

    it('leaves development and CI alone', () => {
      expect(() =>
        validateApiEnv({
          ...VALID_ENV,
          TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
        }),
      ).not.toThrow();
    });
  });
});
