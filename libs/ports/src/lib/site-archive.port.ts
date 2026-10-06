/** A site, packed in one file: its database, its uploaded files and a note of what version made it (docs/adr/0105). */
export interface SiteArchive {
  /** What the file is called: letters, digits, dots, dashes and underscores, ending in `.tar.gz`. */
  readonly fileName: string;
  /** The `.tar.gz`, as it is being made. Stopping reading it stops making it. */
  readonly content: AsyncIterable<Uint8Array>;
}

/**
 * Makes the archive of the site this deployment serves, for the editor's
 * Settings → Export. Implemented by @kometio/launcher-site-archive, which asks
 * the process that runs the deployment's own database; a deployment whose
 * database is somebody else's has no such port.
 */
export interface SiteArchivePort {
  /**
   * Starts an archive and resolves with it, which is when it is known that one
   * is being made: what can be refused is refused here
   * (`SiteArchiveRefusedError`), and what goes wrong after is the end of
   * `content` with an error, never a `content` that ends as if it were whole.
   */
  export(): Promise<SiteArchive>;
}
