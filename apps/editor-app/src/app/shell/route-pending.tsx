import { useTranslation } from 'react-i18next';

export function RoutePending() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      {t('common.loading')}
    </div>
  );
}
