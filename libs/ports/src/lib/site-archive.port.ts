/** A site, packed in one file: its database, its uploaded files and a note of what version made it (docs/adr/0105). */
export interface SiteArchive {
  /** What the file is called: letters, digits, dots, dashes and underscores, ending in `.tar.gz`. */
  readonly fileName: string;
  /** The `.tar.gz`, as it is being made. Stopping reading it stops making it. */
  readonly content: AsyncIterable<Uint8Array>;
}

/**
 * Makes the archive of the site this deployment serves, for the editor's
 * Settings → Export (docs/adr/0105). Implemented by
 * @kometio/launcher-site-archive, which asks the process that runs the
 * deployment's own database; a deployment whose database is somebody else's has
 * no such port.
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

/**
 * Opens a site archive into a deployment that has no site yet, from the
 * first-run screen (docs/adr/0106). The other half of what
 * @kometio/launcher-site-archive does, for the code that only opens and never
 * exports, and the other way round.
 */
export interface SiteImportPort {
  /**
   * Hands an archive over to be opened, and resolves once it has been read and
   * accepted, which is before it is opened: that takes minutes, and stops the
   * very process that is asking. What is wrong with the archive is refused here
   * (`InvalidSiteArchiveError`), and so is an installation that already has a
   * site (`SiteArchiveRefusedError`); nothing has been stopped by then. How the
   * opening went is asked for with `lastImportFailure`.
   */
  import(content: AsyncIterable<Uint8Array>): Promise<void>;

  /**
   * Why the last import did not come through, in words fit for anybody to read,
   * or `null` when there was none or it did. For the first-run screen, which
   * waits for the import while the API is stopped and asks it once it is back.
   */
  lastImportFailure(): Promise<string | null>;
}
