import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { IconButton } from './icon-button';

export interface PaginationProps {
  /** The page shown, from 1. */
  page: number;
  totalPages: number;
  /** Given the page to go to, from 1: the caller decides what changing page does — an address, a state. */
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * Previous, "Page 2 of 5", next — the one way a list that is cut into pages
 * says where you are in it and lets you move.
 *
 * Seven lists had each drawn this by hand, word for word, and each held its
 * own copy of the three sentences. Nothing is drawn for a list that fits on
 * one page: a control with nothing to do is noise.
 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  className,
}: PaginationProps) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;

  return (
    <div className={cn('flex items-center justify-center gap-3', className)}>
      <IconButton
        label={t('common.pagination.previous')}
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft />
      </IconButton>
      <span className="text-sm text-muted-foreground tabular-nums">
        {t('common.pagination.indicator', { page, totalPages })}
      </span>
      <IconButton
        label={t('common.pagination.next')}
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight />
      </IconButton>
    </div>
  );
}
