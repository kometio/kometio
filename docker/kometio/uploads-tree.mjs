// A copy of the uploads folder that an archive can be made from (docs/adr/0105).
//
// `tar` used to be given a link to the folder and told to follow links, and a
// link that is in the uploads folder is followed too: the API's user owns that
// folder and can put there a link to any file of the machine, and root, which
// makes the archive, reads what it points to and writes it into the archive as
// a file of the site. So the archive is made from a folder of root's own, in
// which every regular file is a hard link to the file in the uploads folder
// (nothing is copied, nothing is read twice) and anything else is left out. The
// folder is looked at once, with `lstat`; what is in the archive is what was
// seen then, and a link put there afterwards is not in the copy.
import {
  copyFileSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';

/**
 * Makes `target` (a folder that does not exist yet) a copy of `source` that costs
 * no space: a folder for every folder, a hard link for every regular file.
 * Anything that is not one of those (a symbolic link, a socket, a device) is
 * not in the copy, and is named in `skipped`. Where a hard link cannot be made
 * (another filesystem, or a file this process may not link) the file is copied.
 *
 * @returns {{ files: number, bytes: number, skipped: string[] }}
 */
export function linkTree(source, target) {
  const result = { files: 0, bytes: 0, skipped: [] };
  mkdirSync(target, { recursive: true, mode: 0o755 });
  if (existsSync(source)) walk(source, target, '', result);
  return result;
}

function walk(source, target, relative, result) {
  for (const name of readdirSync(`${source}/${relative}`)) {
    const path = relative === '' ? name : `${relative}/${name}`;
    const stat = lstatSync(`${source}/${path}`);
    if (stat.isDirectory()) {
      mkdirSync(`${target}/${path}`, { mode: 0o755 });
      walk(source, target, path, result);
    } else if (stat.isFile()) {
      try {
        linkSync(`${source}/${path}`, `${target}/${path}`);
      } catch {
        copyFileSync(`${source}/${path}`, `${target}/${path}`);
      }
      result.files += 1;
      result.bytes += stat.size;
    } else {
      result.skipped.push(path);
    }
  }
}
