import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Label } from '../../components/ui/label';

export interface RecoveryCodesPanelProps {
  codes: string[];
  saved: boolean;
  onSavedChange: (saved: boolean) => void;
}

/**
 * The recovery codes of a person who has just turned the second step on, or
 * asked for new ones: shown once, with the two ways to keep them (a file, or
 * a copy by hand), and a box that says they have been kept.
 *
 * The file is made in the browser from what is on screen: nothing is sent
 * anywhere, and the codes are not kept by the editor once the dialog closes.
 */
export function RecoveryCodesPanel({
  codes,
  saved,
  onSavedChange,
}: RecoveryCodesPanelProps) {
  const { t } = useTranslation();
  const checkboxId = useId();

  function download() {
    const text = `${t('account.secondFactor.codesFileTitle')}\n\n${codes.join('\n')}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'kometio-recovery-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        {t('account.secondFactor.codesIntro', { count: codes.length })}
      </p>
      <ul
        className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border p-3 font-mono text-sm"
        aria-label={t('account.secondFactor.codesLabel')}
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <Download aria-hidden />
          {t('account.secondFactor.codesDownload')}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={checkboxId}
          checked={saved}
          onCheckedChange={(checked) => onSavedChange(checked === true)}
        />
        <Label htmlFor={checkboxId}>
          {t('account.secondFactor.codesSaved')}
        </Label>
      </div>
    </div>
  );
}
