import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import type { FormRecord } from '../../lib/forms-api-client';
import { FORMS_PAGE_SIZE, formsQueryOptions } from './forms-queries';
import { ListItemButton } from '../../components/ui/list-item-button';
import { Pagination } from '../common/pagination';

export interface FormPickerDialogProps {
  siteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (form: FormRecord) => void;
}

export function FormPickerDialog({
  siteId,
  open,
  onOpenChange,
  onSelect,
}: FormPickerDialogProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  // Gated on `open`: same reasoning as MediaPickerDialog — this dialog is
  // mounted for the lifetime of the page editor, not just while visible.
  const { data } = useQuery({
    ...formsQueryOptions(siteId, page),
    enabled: open,
  });
  const totalPages = Math.max(
    1,
    Math.ceil((data?.total ?? 0) / FORMS_PAGE_SIZE),
  );

  function handleOpenChange(next: boolean) {
    if (!next) setPage(1);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('forms.picker.title')}</DialogTitle>
        </DialogHeader>
        {data && data.items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('forms.picker.empty')}
          </p>
        )}
        {data && data.items.length > 0 && (
          <ul className="divide-y rounded-md border">
            {data.items.map((form) => (
              <li key={form.id}>
                <ListItemButton inset="row" onClick={() => onSelect(form)}>
                  <span className="font-medium">{form.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {t('forms.picker.fieldCount', {
                      count: form.fields.length,
                    })}
                  </span>
                </ListItemButton>
              </li>
            ))}
          </ul>
        )}
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </DialogContent>
    </Dialog>
  );
}
