import { cn } from '../../lib/utils';

/**
 * Backgrounds for the initial, dark enough for white text on every one of
 * them (4.5:1 or better). Written out whole so Tailwind finds them.
 */
const INITIAL_BACKGROUNDS = [
  'bg-sky-700',
  'bg-emerald-700',
  'bg-violet-700',
  'bg-rose-700',
  'bg-amber-700',
  'bg-teal-700',
  'bg-indigo-700',
  'bg-fuchsia-700',
] as const;

const SIZES = {
  sm: 'size-7 text-xs',
  md: 'size-9 text-sm',
  lg: 'size-20 text-2xl',
} as const;

export interface UserAvatarProps {
  /** Stable per person, so their colour is the same on every screen and every visit. */
  seed: string;
  /** What the initial is taken from: their name, or their email when they have none. */
  name: string;
  imageUrl: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}

/** The same small sum everywhere: a person keeps their colour. */
function backgroundFor(seed: string): string {
  let sum = 0;
  for (const char of seed) sum = (sum + (char.codePointAt(0) ?? 0)) % 997;
  return (
    INITIAL_BACKGROUNDS[sum % INITIAL_BACKGROUNDS.length] ??
    INITIAL_BACKGROUNDS[0]
  );
}

/**
 * A person's picture in a circle, or — until they upload one — the first
 * letter of their name on a colour of their own.
 *
 * Decorative: the name is always written beside it, so a screen reader
 * gets nothing from it but a repetition.
 */
export function UserAvatar({
  seed,
  name,
  imageUrl,
  size = 'md',
  className,
}: UserAvatarProps) {
  const classes = cn(
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
    SIZES[size],
    className,
  );
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        aria-hidden="true"
        className={cn(classes, 'object-cover')}
      />
    );
  }
  // A whole character, never half of an accented letter or an emoji.
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase() ?? '?';
  return (
    <span
      aria-hidden="true"
      data-testid="user-avatar-initial"
      className={cn(classes, 'font-semibold text-white', backgroundFor(seed))}
    >
      {initial}
    </span>
  );
}
