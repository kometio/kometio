import express from 'express';
import { resolve, sep } from 'node:path';
import type { INestApplication } from '@nestjs/common';

/**
 * How uploaded files are served, in one place (ADR-0054).
 *
 * It lives here rather than inline in `main.ts` because the integration
 * tests need the SAME configuration: they used to mount their own bare
 * `express.static`, which meant a test asserting a response header was
 * really asserting the test's own setup, and would have kept passing if
 * production had lost the header entirely.
 *
 * Two trees with different rules:
 *
 * - **attachments** — public form uploads, taken from unauthenticated
 *   visitors. Content-sniffed on the way in (`sniffAttachmentType`) and
 *   forced to download here as a second, independent layer: even a type
 *   that slipped through can never execute as HTML or SVG in a browser
 *   (security review 2026-08-25).
 * - **files** — the library's files that are not images, video or audio
 *   the sniffer vouched for (ADR-0070): PDFs, documents, archives, and
 *   anything whose bytes proved nothing. Forced to download, for the same
 *   reason as attachments — their type came from a name somebody chose,
 *   and a `.html` or `.svg` opened in place runs its scripts with the
 *   session of whoever clicked it. An `<img>` still shows an SVG from
 *   here: a page loading a subresource ignores this header.
 * - **media** — the library. Served INLINE, deliberately: an `<img>`,
 *   `<video>` or `<audio>` cannot render a file the server told the
 *   browser to save. What makes that safe is upstream — images are
 *   re-encoded to WebP by sharp, and video and audio have their bytes
 *   checked against a short allow-list that contains nothing executable
 *   (ADR-0054).
 *
 * `nosniff` on both: it costs nothing and removes "the browser decided
 * the type differs from what we said" from consideration entirely.
 */
export function mountMediaStatic(
  app: INestApplication,
  mediaUploadDir: string,
  prefix = '',
): void {
  const downloadOnly = ['attachments', 'files'].map((dir) =>
    `${resolve(mediaUploadDir, dir)}${sep}`.toLowerCase(),
  );

  // ONE static mount, and the download rule decided by where the file
  // really is on disk — never by the URL that asked for it.
  //
  // It used to be a mount per directory, matched on the URL prefix. The
  // URL is not the file: `/uploads/%61ttachments/x.pdf` does not match
  // `/uploads/attachments`, falls through to the general mount, and
  // serve-static decodes it back to the very same file — served INLINE.
  // Measured on 2026-09-13 against the running API, not reasoned about.
  // For an attachment that was a second barrier quietly missing; for
  // `files/`, where an uploaded `.html` lives, it would have been the only
  // one.
  //
  // Lower-cased because a case-insensitive disk (macOS, and some mounted
  // volumes) serves `/uploads/Files/…` from `files/` too.
  app.use(
    `${prefix}/uploads`,
    express.static(mediaUploadDir, {
      setHeaders: (res, filePath) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const onDisk = resolve(filePath).toLowerCase();
        if (downloadOnly.some((dir) => onDisk.startsWith(dir))) {
          res.setHeader('Content-Disposition', 'attachment');
        }
      },
    }),
  );
}
