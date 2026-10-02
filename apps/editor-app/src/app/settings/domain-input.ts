/** What was typed as a domain, made into one — and what had to go for it to be one. */
export interface CleanedDomain {
  domain: string;
  /** The pieces taken out, in the order they stood: `['https://', '/chi-siamo']`. Empty when nothing was. */
  removed: string[];
}

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const PORT = /:\d*$/;

/**
 * A domain is a bare hostname: what is pasted into the field is often the
 * address bar's — `https://www.sito.it/chi-siamo` — so the scheme, the
 * path and a port are taken out, and the letters made lowercase, which is
 * all a hostname is written in (the API refuses anything else).
 *
 * The pieces are handed back so the screen can say what it took out
 * instead of changing the field silently.
 */
export function cleanDomainInput(raw: string): CleanedDomain {
  const removed: string[] = [];
  let rest = raw.trim();

  const scheme = SCHEME.exec(rest);
  if (scheme) {
    removed.push(scheme[0].toLowerCase());
    rest = rest.slice(scheme[0].length);
  }

  // In the order they stood: the port sits before the path.
  const pathStart = rest.search(/[/?#]/);
  const path = pathStart === -1 ? '' : rest.slice(pathStart);
  rest = pathStart === -1 ? rest : rest.slice(0, pathStart);

  const port = PORT.exec(rest);
  if (port) {
    removed.push(port[0]);
    rest = rest.slice(0, port.index);
  }
  if (path) removed.push(path);

  return { domain: rest.toLowerCase(), removed };
}
