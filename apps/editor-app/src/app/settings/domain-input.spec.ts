import { describe, expect, it } from 'vitest';
import { cleanDomainInput } from './domain-input';

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
