import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import {
  File,
  FileText,
  Film,
  Folder,
  Image as ImageIcon,
  Music,
  type LucideIcon,
} from 'lucide-react';
import { MEDIA_KINDS, type MediaKind } from '@kometio/shared-types';

/** The name each folder goes by — the same words the kind filter already uses, so the two never call one thing by two names. */
export const MEDIA_KIND_LABEL = {
  image: 'media.filters.kindImage',
  video: 'media.filters.kindVideo',
  audio: 'media.filters.kindAudio',
  document: 'media.filters.kindDocument',
  other: 'media.filters.kindOther',
} as const satisfies Record<MediaKind, string>;

/** The small sign on the folder that says what is inside it. */
const KIND_ICON: Record<MediaKind, LucideIcon> = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  document: FileText,
  other: File,
};

export interface MediaFoldersProps {
  counts: Record<MediaKind, number>;
}

/**
 * The library's front door: one folder per kind of file, with how many
 * each holds.
 *
 * It opened onto every file at once — nineteen screenshots, a photo, and
 * since ADR-0070 whatever PDFs and archives somebody had uploaded, all in
 * one grid. The owner's words: "non che entro e vedo tutti i file
 * spiattellati".
 *
 * Links, not buttons: a folder is a place, it has an address somebody can
 * reload or open in a new tab, and Back takes you out of it.
 *
 * An empty folder is still shown. Hiding it would make the library's
 * shape change with its contents, and "where do PDFs go?" would have no
 * answer until the first one was there.
 */
export function MediaFolders({ counts }: MediaFoldersProps) {
  const { t } = useTranslation();

  return (
    <nav aria-label={t('media.folders.label')}>
      {/* As many columns as fit at a readable width, rather than a fixed
          count per breakpoint: the space this sits in is whatever the
          shell leaves over, and a fixed two columns squeezed "Documents"
          out of its own card in a narrow window. */}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
        {MEDIA_KINDS.map((kind) => {
          const Icon = KIND_ICON[kind];
          const count = counts[kind];
          return (
            <li key={kind}>
              <Link
                to="/media"
                search={{ page: 1, kind }}
                className="flex h-full flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {/* A folder, because that is what the owner asked to see
                    ("icone di cartelle che clicco"), with the kind drawn
                    on it so the five are told apart without reading. */}
                <span className="relative inline-flex size-12" aria-hidden>
                  <Folder
                    className="size-12 fill-muted text-muted-foreground"
                    strokeWidth={1.25}
                  />
                  <Icon className="absolute bottom-2 left-1/2 size-4 -translate-x-1/2 text-foreground" />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">
                    {t(MEDIA_KIND_LABEL[kind])}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t('media.folders.count', { count })}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
