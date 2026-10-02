import { describe, expect, it } from 'vitest';
import { isSiteDomain, siteDomainSchema } from './site-domain';

describe('siteDomainSchema', () => {
  it.each([
    'example.com',
    'www.example.it',
    'a.b.c.example.co.uk',
    'localhost',
    'xn--e1afmkfd.xn--p1ai',
    'my-site.example.com',
  ])('accepts %s', (domain) => {
    expect(isSiteDomain(domain)).toBe(true);
  });

  it.each([
    '',
    'https://example.com',
    'example.com/chi-siamo',
    'example.com:8080',
    'Example.com',
    'exa mple.com',
    '-example.com',
    'example-.com',
    'example..com',
    '.example.com',
    'example.com.',
    'a'.repeat(64) + '.com',
  ])('rejects %j', (domain) => {
    expect(isSiteDomain(domain)).toBe(false);
  });

  it('rejects a name longer than a hostname can be', () => {
    const long = `${'a'.repeat(60)}.`.repeat(5) + 'com';
    expect(siteDomainSchema.safeParse(long).success).toBe(false);
  });
});
