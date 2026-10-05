import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { API_BASE_URL } from '../../lib/http-client';
import { SiteArchiveSection } from './site-archive-section';

describe('SiteArchiveSection', () => {
  it('says what is in the file and what is left out, before there is a file', () => {
    render(<SiteArchiveSection />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Esporta' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Cosa c’è nel file' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Cosa non c’è' })).toBeTruthy();
    // The three things that do not travel, each said in words.
    expect(screen.getByText(/Chi ha effettuato l’accesso/)).toBeTruthy();
    expect(
      screen.getByText(/risposte che le persone hanno inviato/),
    ).toBeTruthy();
    expect(screen.getByText(/chiave del fornitore di AI/)).toBeTruthy();
  });

  it('says the file is a secret', () => {
    render(<SiteArchiveSection />);

    expect(
      screen.getByText('Custodisci il file come una password'),
    ).toBeTruthy();
    expect(
      screen.getByText(/impronta della password di ogni account/),
    ).toBeTruthy();
  });

  // A link and not a request: the archive can be large, and only the browser
  // can write it to disk as it arrives. A new tab keeps the editor in place
  // when the server refuses.
  it('downloads by a link to the API, in a tab of its own', () => {
    render(<SiteArchiveSection />);

    const link = screen.getByRole('link', { name: 'Scarica il sito' });
    expect(link.getAttribute('href')).toBe(`${API_BASE_URL}/site-archive`);
    expect(link.hasAttribute('download')).toBe(true);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('shows the command that opens it elsewhere', () => {
    render(<SiteArchiveSection />);

    expect(
      screen.getByText(/docker run --rm -i -v kometio-data:\/data .* import </),
    ).toBeTruthy();
  });
});
