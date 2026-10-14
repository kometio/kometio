import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SeoMeta } from '@kometio/shared-types';
import { TooltipProvider } from '../../components/ui/tooltip';
import { ToastProvider } from '../shell/toast-provider';
import {
  MediaPickerContext,
  type MediaPickerPort,
} from '../media/media-picker-context';
import { SeoMetaDialog } from './seo-meta-dialog';

const seoMeta: SeoMeta = {
  title: 'Chi siamo',
  description: 'La nostra storia',
};

function renderDialog(
  onSave: (next: SeoMeta) => Promise<void>,
  options: { showNoIndex?: boolean; seoMeta?: SeoMeta } = {},
) {
  const port: MediaPickerPort = { pick: vi.fn() };
  const onOpenChange = vi.fn();
  render(
    <TooltipProvider>
      <ToastProvider>
        <MediaPickerContext.Provider value={port}>
          <SeoMetaDialog
            heading="SEO di Chi siamo"
            seoMeta={options.seoMeta ?? seoMeta}
            open
            onOpenChange={onOpenChange}
            onSave={onSave}
            isSaving={false}
            showNoIndex={options.showNoIndex}
          />
        </MediaPickerContext.Provider>
      </ToastProvider>
    </TooltipProvider>,
  );
  return { onOpenChange };
}

describe('SeoMetaDialog', () => {
  it('says the SEO was saved and closes: nothing else on screen would tell', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { onOpenChange } = renderDialog(onSave);

    fireEvent.click(screen.getByRole('button', { name: /^Salva/ }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(await screen.findByText('Impostazioni SEO salvate')).toBeTruthy();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('says what was not saved, and stays open, when it fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const { onOpenChange } = renderDialog(onSave);

    fireEvent.click(screen.getByRole('button', { name: /^Salva/ }));

    expect(
      await screen.findByText(
        'Le impostazioni SEO non sono state salvate. Riprova.',
      ),
    ).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  describe('hiding the page from search engines', () => {
    const switchName = /Nascondi ai motori di ricerca|Hide from search engines/;

    it('is not offered where the flag lives elsewhere, as it does for a term', () => {
      renderDialog(vi.fn(), { showNoIndex: false });

      expect(screen.queryByRole('switch', { name: switchName })).toBeNull();
    });

    it('is off to begin with, and saved as on once it is turned on', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderDialog(onSave, { showNoIndex: true });
      const toggle = screen.getByRole('switch', { name: switchName });
      expect(toggle.getAttribute('aria-checked')).toBe('false');

      fireEvent.click(toggle);
      fireEvent.click(screen.getByRole('button', { name: /^Salva/ }));

      await waitFor(() =>
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({ noIndex: true }),
        ),
      );
    });

    it('is on for a page that asked, and leaves no trace of it once turned off', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderDialog(onSave, {
        showNoIndex: true,
        seoMeta: { ...seoMeta, noIndex: true },
      });
      const toggle = screen.getByRole('switch', { name: switchName });
      expect(toggle.getAttribute('aria-checked')).toBe('true');

      fireEvent.click(toggle);
      fireEvent.click(screen.getByRole('button', { name: /^Salva/ }));

      await waitFor(() => expect(onSave).toHaveBeenCalled());
      expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty('noIndex');
    });

    it('does not put a flag on what it was not offered for', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderDialog(onSave, { seoMeta: { ...seoMeta, noIndex: true } });

      fireEvent.click(screen.getByRole('button', { name: /^Salva/ }));

      await waitFor(() => expect(onSave).toHaveBeenCalled());
      expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty('noIndex');
    });
  });
});
