import { useId, type FormEvent, type ReactNode } from 'react';
import { InlineError } from '../../components/ui/inline-error';
import { ConfirmActionDialog } from '../common/confirm-action-dialog';
import { SaveBar } from './save-bar';
import type { SaveConfirmation } from './use-saved-form';

export interface SettingsSectionHeaderProps {
  title: string;
  description?: string;
  /** For `aria-labelledby` on whatever the heading names. */
  id?: string;
  /** What the section does that is not filling a field — Invite, on the users' list. */
  actions?: ReactNode;
}

/**
 * The name of one section of the settings area, and a sentence on what it
 * decides. An `h2`: the area's own `h1` is "Settings", and each section is
 * a part of it.
 */
export function SettingsSectionHeader({
  title,
  description,
  id,
  actions,
}: SettingsSectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export interface SettingsFormProps {
  /** What the save came back with, in words: shown above the bar, where the failing action is. */
  error: string;
  isDirty: boolean;
  isSaving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  /** False while what the form holds cannot be sent at all. */
  canSave?: boolean;
  /** A question to answer before the save goes through (`useSavedForm`'s `confirmBeforeSave`); `null` when there is none. */
  confirmation?:
    | (SaveConfirmation & {
        onConfirm: () => void;
        onCancel: () => void;
      })
    | null;
  /** Names the form for a screen reader: the id of its heading. */
  labelledBy?: string;
  /** Spacing between the blocks of fields. */
  className?: string;
  children: ReactNode;
}

/**
 * The form of a screen that saves as one: the fields, the error a refused
 * save gives, and the bar that saves. The state comes from
 * `useSiteSettingsForm`, whose `section` is spread into it.
 *
 * Its own piece because not every such screen is a section of the settings
 * area: Style is a page with a title of its own, and only wants this.
 */
export function SettingsForm({
  error,
  isDirty,
  isSaving,
  onSubmit,
  onCancel,
  canSave = true,
  confirmation = null,
  labelledBy,
  className = 'flex flex-col gap-8',
  children,
}: SettingsFormProps) {
  return (
    <>
      {/* noValidate: a field's own rule answers under the field, in the
          editor's words. The browser's check ran first and stopped the
          save with its own bubble — "2.5" days never reached the rule. */}
      <form
        onSubmit={onSubmit}
        noValidate
        aria-labelledby={labelledBy}
        className={className}
      >
        {children}
        <div className="flex flex-col gap-3">
          <InlineError>{error}</InlineError>
          <SaveBar
            isDirty={isDirty}
            isSaving={isSaving}
            canSave={canSave}
            onCancel={onCancel}
          />
        </div>
      </form>
      {/* Outside the form: what it answers is the save, not a field. */}
      {confirmation && (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => !open && confirmation.onCancel()}
          title={confirmation.title}
          description={confirmation.description}
          actionLabel={confirmation.actionLabel}
          actionVariant={confirmation.destructive ? 'destructive' : 'default'}
          onConfirm={confirmation.onConfirm}
        />
      )}
    </>
  );
}

export interface SettingsSectionProps extends Omit<
  SettingsFormProps,
  'labelledBy' | 'className'
> {
  title: string;
  description?: string;
}

/**
 * The frame of every section that edits one group of the site's settings
 * as a form: its heading, then the form (see SettingsForm).
 *
 * It replaces the frame of the dialogs these sections used to be, which
 * had a title, the fields, and Cancel / Save in a footer that only existed
 * while the dialog was open.
 */
export function SettingsSection({
  title,
  description,
  children,
  ...form
}: SettingsSectionProps) {
  const headingId = useId();
  return (
    <SettingsForm {...form} labelledBy={headingId}>
      <SettingsSectionHeader
        id={headingId}
        title={title}
        description={description}
      />
      {children}
    </SettingsForm>
  );
}
