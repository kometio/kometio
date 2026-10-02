import { join } from 'node:path';

/*
 * The volume the API, the theme builder and the public site share
 * (docs/adr/0091), and where each thing lives on it. The API writes an
 * upload and its first status; the builder does everything after; the
 * site only reads `current.json` and the build it names.
 *
 *   uploads/<id>/theme.zip      what was uploaded
 *   uploads/<id>/status.json    where it has got to
 *   uploads/<id>/build.log      the build's output
 *   installed/<name>/           every uploaded theme the site is built with
 *   manifests/<name>/theme.json what the editor offers (the API's catalog)
 *   builds/<build>/dist         a whole site, built with those themes
 *   current.json                the build the site serves
 */
export function themeDataPaths(root: string) {
  return {
    uploads: join(root, 'uploads'),
    upload: (id: string) => {
      const directory = join(root, 'uploads', id);
      return {
        directory,
        archive: join(directory, 'theme.zip'),
        status: join(directory, 'status.json'),
        log: join(directory, 'build.log'),
        /** Where the builder unpacks it, before it is known to build. */
        unpacked: join(directory, 'theme'),
      };
    },
    installed: join(root, 'installed'),
    manifests: join(root, 'manifests'),
    builds: join(root, 'builds'),
    current: join(root, 'current.json'),
  };
}

/** What `current.json` says: the build to serve, and the packages it was made for. */
export interface PublishedBuild {
  build: string;
  /** See apps/public-site/build-compatibility.mjs. */
  compatibility: string;
  publishedAt: string;
}
