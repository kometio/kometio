import type { StorageProvider } from '@kometio/shared-types';
import { InvalidMediaFilenameError } from '../errors';

/** The longest name a file may be given — a filesystem's own limit. */
export const MAX_MEDIA_FILENAME_LENGTH = 255;

export type { StorageProvider };

export interface MediaProps {
  id: string;
  tenantId: string;
  siteId: string;
  filename: string;
  /** The alternative text the library holds for this file — empty until written. */
  alt: string;
  storageKey: string;
  storageProvider: StorageProvider;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: Date;
}

export class Media {
  private constructor(private props: MediaProps) {}

  static create(
    input: Omit<MediaProps, 'createdAt' | 'alt'> & { alt?: string; now?: Date },
  ): Media {
    const { now, alt, ...rest } = input;
    return new Media({
      ...rest,
      alt: alt ?? '',
      createdAt: now ?? new Date(),
    });
  }

  static fromProps(props: MediaProps): Media {
    return new Media({ ...props });
  }

  toProps(): MediaProps {
    return { ...this.props };
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get siteId(): string {
    return this.props.siteId;
  }

  get filename(): string {
    return this.props.filename;
  }

  get alt(): string {
    return this.props.alt;
  }

  get storageKey(): string {
    return this.props.storageKey;
  }

  get storageProvider(): StorageProvider {
    return this.props.storageProvider;
  }

  get mimeType(): string {
    return this.props.mimeType;
  }

  get size(): number {
    return this.props.size;
  }

  get width(): number | null {
    return this.props.width;
  }

  get height(): number | null {
    return this.props.height;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** The name the file is shown and downloaded under; the stored file keeps its own key. */
  rename(filename: string): void {
    const name = filename.trim();
    if (name === '') throw new InvalidMediaFilenameError('it is empty');
    if (name.length > MAX_MEDIA_FILENAME_LENGTH) {
      throw new InvalidMediaFilenameError(
        `it is longer than ${MAX_MEDIA_FILENAME_LENGTH} characters`,
      );
    }
    // A name, not a place: a slash would turn a download into a path.
    if (/[/\\]/.test(name)) {
      throw new InvalidMediaFilenameError('it contains a slash');
    }
    // Control characters have no business in a file name or a header.
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(name)) {
      throw new InvalidMediaFilenameError('it contains a control character');
    }
    this.props.filename = name;
  }

  /** Written as it is typed, apart from the spaces around it. */
  changeAlt(alt: string): void {
    this.props.alt = alt.trim();
  }
}
