import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

/**
 * The shape of something still on its way. It pulses only for someone who
 * has not asked for less motion, and says nothing to a screen reader: the
 * compositions below carry the words.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn('rounded-md bg-muted motion-safe:animate-pulse', className)}
      {...props}
    />
  );
}

interface SkeletonGroupProps {
  /** What a screen reader hears; "Loading…" unless the view says more. */
  label?: string;
  className?: string;
}

/**
 * A form that is loading, drawn as the label-and-field pairs it is about
 * to show — a dialog used to open on the single word "Loading…" and then
 * jump to its full height.
 */
function SkeletonFields({
  fields = 3,
  label,
  className,
}: SkeletonGroupProps & { fields?: number }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className={cn('flex flex-col gap-4', className)}
      data-slot="skeleton-fields"
    >
      <span className="sr-only">{label ?? t('common.loading')}</span>
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-8 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

/** A list that is loading, drawn as its rows. */
function SkeletonRows({
  rows = 4,
  label,
  className,
}: SkeletonGroupProps & { rows?: number }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className={cn('flex flex-col gap-2', className)}
      data-slot="skeleton-rows"
    >
      <span className="sr-only">{label ?? t('common.loading')}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  );
}

export { Skeleton, SkeletonFields, SkeletonRows };
