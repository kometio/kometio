import { useTranslation } from 'react-i18next';
import { USER_ROLES, type UserRole } from '@kometio/shared-types';
import { cn } from '../../lib/utils';

export interface RoleDescriptionsProps {
  /** The role that is being chosen or looked at, when there is one: it is set apart from the others. */
  highlighted?: UserRole;
  className?: string;
}

/**
 * What each role may do, one line per role, in the words of what a person
 * does rather than of the permission table (`docs/roles.md`,
 * `PERMISSIONS`): the names "Publisher" and "Editor" say little to the one
 * who has to pick between them.
 *
 * The same list is under the users' list and in the invitation, because
 * that is where the choice is made and where it is looked at afterwards.
 */
export function RoleDescriptions({
  highlighted,
  className,
}: RoleDescriptionsProps) {
  const { t } = useTranslation();
  return (
    <dl className={cn('flex flex-col gap-2 text-sm', className)}>
      {USER_ROLES.map((role) => {
        // Set apart by its colour and weight, not by dimming the others:
        // a dimmed line of muted text no longer reads at 4.5:1.
        const isChosen = role === highlighted;
        return (
          <div
            key={role}
            className="flex flex-col gap-0.5 sm:flex-row sm:gap-3"
          >
            <dt
              className={cn(
                'w-24 shrink-0 font-medium',
                isChosen && 'font-semibold',
              )}
            >
              {t(`users.role.${role}`)}
            </dt>
            <dd
              className={cn(
                'text-muted-foreground',
                isChosen && 'text-foreground',
              )}
            >
              {t(`users.roles.description.${role}`)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
