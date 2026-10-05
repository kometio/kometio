import { describe, expect, it } from 'vitest';
import { cleanDomainInput, domainOfAddress } from './domain-input';

/*
 * The first-run wizard proposes the domain of the address the deployment was
 * told to serve the site on (`KOMETIO_PUBLIC_SITE_URL`): what a person would
 * otherwise have to work out and type, with no way to know it is the one.
 */
describe('domainOfAddress', () => {
  it('is the hostname of a site address', () => {
    expect(domainOfAddress('https://www.sito.it')).toBe('www.sito.it');
  });

  it('leaves the port and the path out: a domain has neither', () => {
    expect(domainOfAddress('http://localhost:4322')).toBe('localhost');
    expect(domainOfAddress('https://sito.it/it/chi-siamo')).toBe('sito.it');
  });

  it('writes it in lowercase, as the address is read', () => {
    expect(domainOfAddress('https://WWW.Sito.IT')).toBe('www.sito.it');
  });

  it('is empty for something that is not an address, rather than a guess', () => {
    expect(domainOfAddress('')).toBe('');
    expect(domainOfAddress('www.sito.it')).toBe('');
    expect(domainOfAddress('not an address')).toBe('');
  });

  it('is empty for an address no site can be found on, such as an IPv6 literal', () => {
    expect(domainOfAddress('http://[::1]:4322')).toBe('');
  });
});

describe('cleanDomainInput', () => {
  it('leaves a domain as it is', () => {
    expect(cleanDomainInput('www.sito.it')).toEqual({
      domain: 'www.sito.it',
      removed: [],
    });
  });

  it('takes the scheme and the path out of an address pasted from the bar, and says so', () => {
    expect(cleanDomainInput('https://www.sito.it/chi-siamo')).toEqual({
      domain: 'www.sito.it',
      removed: ['https://', '/chi-siamo'],
    });
  });

  it('takes a query, a fragment and a bare slash out', () => {
    expect(cleanDomainInput('sito.it?x=1').removed).toEqual(['?x=1']);
    expect(cleanDomainInput('sito.it#top').removed).toEqual(['#top']);
    expect(cleanDomainInput('sito.it/').removed).toEqual(['/']);
  });

  it('takes a port out, after the path is gone', () => {
    expect(cleanDomainInput('http://localhost:3000/admin')).toEqual({
      domain: 'localhost',
      removed: ['http://', ':3000', '/admin'],
    });
    expect(cleanDomainInput('localhost:3000')).toEqual({
      domain: 'localhost',
      removed: [':3000'],
    });
  });

  it('writes the letters lowercase without making a fuss of it', () => {
    expect(cleanDomainInput('  WWW.Sito.IT ')).toEqual({
      domain: 'www.sito.it',
      removed: [],
    });
  });

  it('does not take a scheme for a hostname that has a colon-free start', () => {
    expect(cleanDomainInput('sito.it').removed).toEqual([]);
    expect(cleanDomainInput('').domain).toBe('');
  });
});
