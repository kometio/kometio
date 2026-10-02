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

function renderDialog(onSave: (next: SeoMeta) => Promise<void>) {
  const port: MediaPickerPort = { pick: vi.fn() };
  const onOpenChange = vi.fn();
  render(
    <TooltipProvider>
      <ToastProvider>
        <MediaPickerContext.Provider value={port}>
          <SeoMetaDialog
            heading="SEO di Chi siamo"
            seoMeta={seoMeta}
            open
            onOpenChange={onOpenChange}
            onSave={onSave}
            isSaving={false}
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
});
