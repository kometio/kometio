# 0147 — A site can upload its own font

**Status**: Accepted — 2026-10-18. Follows [0146](0146-the-fonts-a-site-picks-are-its-own-files.md), which took away the free-text Google Fonts name.

## Context

ADR-0146 made the six curated fonts files of the site and dropped the field
that took any Google Fonts name. That field was the only way to use a font
outside the six. The owner asked for the other half at the same time: a site
uploads the font it wants, and visitors download it from the site.

## Decision

- **The files are media.** A font is uploaded through the library like any
  other file. A sixth kind of file, `font`, gives fonts a folder of their own
  (`MEDIA_KINDS`, the database's kind filter, the editor's folders). WOFF2 and
  WOFF are recognised by their bytes (`wOF2`, `wOFF`) and served in place,
  with `nosniff`, like the video and audio the sniffer already vouches for:
  nothing in a font runs, and a stylesheet cannot load a file that is served
  as a download. TrueType and OpenType files are taken as before, as
  downloads; a site serves WOFF2. A font may be up to 10 MB.
- **The site keeps the font as a setting.** `sites.theme_uploaded_font`
  (migration 0018) holds a name and up to four faces, each a media id, its
  address, a weight (`100`–`900`, or `variable` for one file that holds every
  weight) and a style. Two faces with the same weight and style are refused.
  `fontFamily: 'uploaded'` picks it. The uploaded font stays while another is
  picked, so picking it again costs nothing.
- **The server checks the files and sets their addresses.** On every save,
  each face's media must be this site's and a WOFF2 or WOFF font, and its
  address is the one the library serves it from, whatever the request said.
  `uploaded` without an uploaded font is refused.
- **The page loads it from the site's own origin**, through
  `/api/site-font?href=…`, which fetches only this site's media (the rule of
  `/_image`, `media-url.ts`), follows no redirect, refuses more than 10 MB,
  and sends the file on only if its bytes are a web font. The page's
  Content-Security-Policy already lets fonts in from the site; the library
  may be another origin, a font is fetched with CORS, and the editor's canvas
  shows the page from an opaque origin. The answer may be kept for a year:
  a new upload is a new address.
- **Declared under a fixed family**, `kometio-uploaded-font`, not the name the
  owner gave it. That name could be a theme's family or a curated one, and the
  browser merges two sets of `@font-face` that share a name. The owner's name
  is shown only in the editor, and so it is never written into a stylesheet.
- **In the editor**, Style has "Upload a font" under the font menu: a name,
  up to four files whose weight and style are guessed from their names and
  can be changed, and a box the owner ticks to say they may use the font on a
  website. The files go to the library as they are uploaded; the font is the
  site's when Style is saved. Taking it off leaves its files in the library.

## Consequences

- A site can look like its brand with no font service anywhere in the page.
- The licence is the owner's responsibility, and the editor asks for it in
  words before anything is uploaded. Kometio cannot check a licence.
- The editor's own preview in Style draws the uploaded font's name with
  something like it, as for the curated fonts: the editor does not load the
  site's files. The canvas shows the real font.
- The library does not yet say that a file is the site's font. Deleting it
  there leaves the pages in the theme's font (the face fails to load and the
  next font in the stack is used) until the font is taken off or replaced in
  Style.
