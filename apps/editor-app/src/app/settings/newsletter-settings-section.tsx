import { useId } from 'react';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { SiteRecord } from '@kometio/api-contracts';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { updateNewsletterCaptcha } from '../../lib/sites-api-client';
import { SettingsSection } from './settings-section';
import { useSiteSettingsForm } from './use-site-settings-form';

export interface NewsletterSettingsSectionProps {
  site: SiteRecord;
}

interface NewsletterSettingsFormValues {
  newsletterCaptchaEnabled: boolean;
}

function toFormValues(site: SiteRecord): NewsletterSettingsFormValues {
  return { newsletterCaptchaEnabled: site.newsletterCaptchaEnabled };
}

/**
 * Whether the newsletter signup of the site asks for a captcha
 * (docs/adr/0145). Here and not on the block: the block has no entity of its
 * own to carry the choice, and the server is the one that has to know it.
 */
export function NewsletterSettingsSection({
  site,
}: NewsletterSettingsSectionProps) {
  const { t } = useTranslation();
  const switchId = useId();
  const { form, section } = useSiteSettingsForm({
    site,
    failedMessage: t('saveBar.failed.newsletter'),
    toFormValues,
    toChange: (values: NewsletterSettingsFormValues) => values,
    send: updateNewsletterCaptcha,
    // Turning it off is the change that opens the list to scripts: asked
    // once, the other way round is not.
    confirmBeforeSave: (values, saved) =>
      saved.newsletterCaptchaEnabled && !values.newsletterCaptchaEnabled
        ? {
            title: t('newsletterSettings.turnOffConfirm.title'),
            description: t('newsletterSettings.turnOffConfirm.description'),
            actionLabel: t('newsletterSettings.turnOffConfirm.action'),
          }
        : null,
  });

  return (
    <SettingsSection
      {...section}
      title={t('settings.nav.items.newsletter')}
      description={t('settings.sections.newsletter.description')}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <div className="flex flex-col gap-1">
            {/* The label is the switch's own, so a click on the words
                turns it too. */}
            <Label htmlFor={switchId}>
              {t('newsletterSettings.captchaLabel')}
            </Label>
            <span className="text-xs text-muted-foreground">
              {t('newsletterSettings.captchaDescription')}
            </span>
          </div>
          <Controller
            control={form.control}
            name="newsletterCaptchaEnabled"
            render={({ field }) => (
              <Switch
                id={switchId}
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t('newsletterSettings.captchaDisclaimer')}
        </p>
      </div>
    </SettingsSection>
  );
}
