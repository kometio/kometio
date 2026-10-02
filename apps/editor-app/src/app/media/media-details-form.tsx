import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { mediaKindOfMime } from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import { InlineError } from '../../components/ui/inline-error';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { actionErrorMessage } from '../../lib/http-client';
import type { MediaRecord } from '../../lib/media-api-client';
import { useToast } from '../shell/toast-provider';
import { useMediaLibrary } from './use-media-library';

export interface MediaDetailsFormProps {
  siteId: string;
  media: MediaRecord;
}

/**
 * What a person writes about a file: what it is called, and — for a
 * picture — what it shows, for somebody who cannot see it.
 *
 * Saved with the form's own button, which appears only while there is
 * something to save. Neither reaches a page that has already picked the
 * file: a block keeps its own copy of both, so this fixes the library and
 * what is picked from now on.
 */
export function MediaDetailsForm({ siteId, media }: MediaDetailsFormProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { updateMedia } = useMediaLibrary(siteId);
  const ids = useId();
  const [name, setName] = useState(media.filename);
  const [alt, setAlt] = useState(media.alt);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  // Only a picture is described: the alternative text of a PDF or a clip
  // is not what anything reads.
  const isImage = mediaKindOfMime(media.mimeType) === 'image';
  const isDirty = name.trim() !== media.filename || alt.trim() !== media.alt;

  function cancel() {
    setName(media.filename);
    setAlt(media.alt);
    setError('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError(t('media.detail.nameRequired'));
      return;
    }
    setError('');
    setIsSaving(true);
    try {
      const kept = await updateMedia(media.id, {
        ...(name.trim() !== media.filename && { filename: name.trim() }),
        ...(alt.trim() !== media.alt && { alt: alt.trim() }),
      });
      // What the server kept is what the form shows, and it is saved.
      setName(kept.filename);
      setAlt(kept.alt);
      toast(t('media.detail.saved'), 'success');
    } catch (err) {
      setError(actionErrorMessage(err, t('media.detail.saveFailed')));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-name`}>{t('media.detail.nameLabel')}</Label>
        <Input
          id={`${ids}-name`}
          value={name}
          aria-invalid={error && !name.trim() ? true : undefined}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      {isImage && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-alt`}>{t('media.detail.altLabel')}</Label>
          <Textarea
            id={`${ids}-alt`}
            rows={2}
            value={alt}
            aria-describedby={`${ids}-alt-hint`}
            onChange={(event) => setAlt(event.target.value)}
          />
          <p id={`${ids}-alt-hint`} className="text-xs text-muted-foreground">
            {t('media.detail.altHint')}
          </p>
        </div>
      )}
      <InlineError>{error}</InlineError>
      {isDirty && (
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={isSaving}>
            {isSaving ? t('media.detail.saving') : t('media.detail.save')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isSaving}
            onClick={cancel}
          >
            {t('media.detail.cancel')}
          </Button>
        </div>
      )}
    </form>
  );
}
