import { createFileRoute } from '@tanstack/react-router';
import { FormSubmissionRetentionSection } from '../app/forms/form-submission-retention-section';
import { siteSettingsRoute } from './-site-settings-route';

export const Route = createFileRoute('/_shell/settings/retention')(
  siteSettingsRoute('configureSite', FormSubmissionRetentionSection),
);
