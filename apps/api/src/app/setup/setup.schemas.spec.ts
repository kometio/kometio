import { bootstrapDeploymentBodySchema } from './setup.schemas';

const BODY = {
  setupToken: 'the-real-token',
  siteName: 'Acme',
  defaultLocale: 'en-US',
  adminEmail: 'anna@example.test',
  adminPassword: 'a-long-enough-password',
};

/*
 * The wizard sends the address the editor proposed (the hostname of the one
 * the deployment was told to serve), possibly changed or cleared by the admin.
 * It is checked here, with the rule the Site settings screen is checked with,
 * so a site cannot be created on a name nothing would ever match.
 */
describe('bootstrapDeploymentBodySchema: the site address', () => {
  it('takes a valid hostname as it is', () => {
    const body = bootstrapDeploymentBodySchema.parse({
      ...BODY,
      domain: 'acme.test',
    });

    expect(body.domain).toBe('acme.test');
  });

  it('reads a request with no address as "set it later"', () => {
    // A client written before the field existed must keep working.
    const body = bootstrapDeploymentBodySchema.parse(BODY);

    expect(body.domain).toBeNull();
  });

  it('reads an explicit null as "set it later"', () => {
    const body = bootstrapDeploymentBodySchema.parse({
      ...BODY,
      domain: null,
    });

    expect(body.domain).toBeNull();
  });

  it.each([
    ['an address with a scheme', 'https://acme.test'],
    ['an address with a path', 'acme.test/home'],
    ['an address with a port', 'localhost:4322'],
    ['capital letters', 'Acme.Test'],
    ['spaces', 'acme test'],
    ['an empty string', ''],
  ])('refuses %s', (_name, domain) => {
    const result = bootstrapDeploymentBodySchema.safeParse({
      ...BODY,
      domain,
    });

    expect(result.success).toBe(false);
  });
});
