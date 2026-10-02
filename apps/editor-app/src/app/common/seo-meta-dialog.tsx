import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SeoMeta } from '@kometio/shared-types';
import { useMediaPicker } from '../media/media-picker-context';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { actionErrorMessage } from '../../lib/http-client';
import { InlineError } from '../../components/ui/inline-error';
import { useToast } from '../shell/toast-provider';

export interface SeoMetaDialogProps {
  /** What this SEO belongs to — a page translation, or a term's route. */
  heading: string;
  seoMeta: SeoMeta;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rejecting here keeps the dialog open and shows why. */
  onSave: (next: SeoMeta) => Promise<void>;
  isSaving: boolean;
}

/**
 * The SEO fields themselves — title, meta description, OG image, canonical
 * — and nothing about who owns them.
 *
 * Split out of `PageGroupSeoPanelDialog` when a term's route needed the
 * same four fields (docs/adr/0067): a term is not a page translation and
 * saves through a different endpoint, but the fields, their validation and
 * the OG-image media picker are the same form. Copying it would have meant
 * two places to fix the next time one of them changes.
 */
export function SeoMetaDialog({
  heading,
  seoMeta,
  open,
  onOpenChange,
  onSave,
  isSaving,
}: SeoMetaDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { pick } = useMediaPicker();
  const [title, setTitle] = useState(seoMeta.title);
  const [description, setDescription] = useState(seoMeta.description);
  const [canonical, setCanonical] = useState(seoMeta.canonical ?? '');
  const [ogImage, setOgImage] = useState(seoMeta.ogTags?.['image'] ?? '');
  const [error, setError] = useState('');

  // Re-syncs from the latest seoMeta every time the dialog opens (or the
  // value behind it changes while closed) — the "adjust state during
  // render" pattern, not an effect: an effect would paint the stale value
  // first and correct it a frame later.
  const [lastOpened, setLastOpened] = useState({ open, seoMeta });
  if (lastOpened.open !== open || lastOpened.seoMeta !== seoMeta) {
    setLastOpened({ open, seoMeta });
    if (open) {
      setTitle(seoMeta.title);
      setDescription(seoMeta.description);
      setCanonical(seoMeta.canonical ?? '');
      setOgImage(seoMeta.ogTags?.['image'] ?? '');
      setError('');
    }
  }

  async function handlePickOgImage() {
    const picked = await pick();
    if (picked) setOgImage(picked.url);
  }

  async function handleSubmit() {
    setError('');
    try {
      await onSave({
        title,
        description,
        ...(canonical.trim() && { canonical: canonical.trim() }),
        ...(ogImage.trim() && { ogTags: { image: ogImage.trim() } }),
      });
      toast(t('pages.seo.saved'), 'success');
      onOpenChange(false);
    } catch (err) {
      setError(actionErrorMessage(err, t('pages.seo.saveFailed')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="seo-title">{t('pages.seo.titleLabel')}</Label>
            <Input
              id="seo-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="seo-description">
              {t('pages.seo.descriptionLabel')}
            </Label>
            <Input
              id="seo-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t('pages.seo.ogImageLabel')}</Label>
            {ogImage && (
              <img
                src={ogImage}
                alt=""
                className="max-w-full rounded-md border"
              />
            )}
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => void handlePickOgImage()}
            >
              {ogImage
                ? t('pages.seo.changeOgImage')
                : t('pages.seo.chooseOgImage')}
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="seo-canonical">
              {t('pages.seo.canonicalLabel')}
            </Label>
            <Input
              id="seo-canonical"
              value={canonical}
              onChange={(event) => setCanonical(event.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>
        {error && <InlineError>{error}</InlineError>}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('pages.seo.cancel')}
          </Button>
          <Button
            type="button"
            disabled={isSaving || title.trim().length === 0}
            onClick={() => void handleSubmit()}
          >
            {isSaving ? t('pages.seo.saving') : t('pages.seo.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
