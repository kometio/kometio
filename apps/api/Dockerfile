# syntax=docker/dockerfile:1
#
# docs/adr/0042 — built from the full monorepo context (root .dockerignore
# excludes the obvious junk, but every app/lib is still visible: apps/api
# depends on ~20 @kometio/* workspace packages, and Nx's own prune step below
# needs the real dependency graph, not a pre-trimmed one).

FROM node:24-alpine AS build
WORKDIR /workspace
# pnpm installed from the version package.json pins, not through corepack:
# corepack is deprecated in Node 24 and absent from the Node 25 images,
# where `corepack enable` fails with "not found" and takes the whole build
# with it. One source of truth, and package.json first so a change to the
# source does not invalidate this layer.
COPY package.json ./
RUN npm install --global "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")"
COPY . .
# Nx evaluates every project's config to build its graph, even to build
# just this one — apps/editor-app/vite.config.mts reads the root .env at
# config-load time (a real value, not process.env) and throws on a missing
# VITE_API_URL. .env is deliberately excluded from the build context (real
# secrets shouldn't ship in an image), so a placeholder copy of
# .env.example stands in here purely to satisfy that graph parse — it has
# no effect on this app's own build.
RUN cp .env.example .env
RUN pnpm install --frozen-lockfile
RUN pnpm nx run @kometio/api:build
# Nx's own Docker-prep pattern (@nx/js:prune-lockfile +
# @nx/js:copy-workspace-modules, apps/api/package.json's "prune" target) —
# rewrites every workspace:* dependency to a local file: path and copies
# each @kometio/* package's real source into dist/workspace_modules/, so the
# runtime stage below can `pnpm install` a self-contained, minimal dist/
# without the rest of the monorepo present.
RUN pnpm nx run @kometio/api:prune
# The prune copies every workspace package the API names, devDependencies
# included, so @kometio/testing (builders, in-memory repositories, fakes)
# travelled into the image even though `pnpm install --prod` below never
# installs it. Dropped here, before the runtime stage copies dist/: a
# dev-only `file:` dependency is skipped by a --prod install, so the frozen
# lockfile does not miss the directory.
RUN node -e " \
  const { rmSync } = require('node:fs'); \
  const pkg = require('/workspace/apps/api/dist/package.json'); \
  const runtime = new Set(Object.keys(pkg.dependencies ?? {})); \
  for (const [name, spec] of Object.entries(pkg.devDependencies ?? {})) { \
    if (runtime.has(name) || !spec.startsWith('file:./workspace_modules/')) continue; \
    rmSync('/workspace/apps/api/dist/' + spec.slice('file:./'.length), { recursive: true }); \
    console.log('dropped dev-only ' + name); \
  }"
# docs/adr/0042 — FilesystemThemeCatalogAdapter (ThemeCatalogPort) needs
# somewhere to scan for bundled themes, but this image otherwise carries
# none of themes/'s Astro source (that's public-site's job). Just each
# theme's own theme.json manifest, preserving its directory name — `COPY
# --from=build themes/*/theme.json` alone would collide, every theme.json
# sharing that same basename once flattened into one destination dir.
RUN mkdir -p /workspace/theme-manifests && \
  for dir in /workspace/themes/*/; do \
  name=$(basename "$dir"); \
  if [ -f "$dir/theme.json" ]; then \
  mkdir -p "/workspace/theme-manifests/$name" && \
  cp "$dir/theme.json" "/workspace/theme-manifests/$name/theme.json"; \
  fi; \
  done

FROM node:24-alpine AS runtime
WORKDIR /app
RUN addgroup -S kometio && adduser -S kometio -G kometio
# The theme volume's mount point (docs/adr/0091), owned by the user this
# API runs as: a named volume takes the ownership of the directory it is
# first mounted over, so the API can write uploads to it.
RUN mkdir -p /data/themes && chown kometio:kometio /data/themes
# Where the secrets key is generated (KOMETIO_SECRETS_DIR): the API's own, and
# nobody else's.
RUN mkdir -p /data/secrets && chown kometio:kometio /data/secrets && chmod 700 /data/secrets
COPY --from=build /workspace/apps/api/dist/ ./
COPY --from=build /workspace/theme-manifests/ ./themes/
# No copy of the workspace root's pnpm-workspace.yaml here any more. Up to
# Nx 23.1 the pruned lockfile still declared the root `overrides` (a pinned
# vite) while nothing in dist/ did, and `onlyBuiltDependencies: [sharp]` was
# nowhere either, so the root file was copied in to match. Since 23.2 the
# prune strips `overrides` from the pruned lockfile (they are already
# resolved into it), writes its own settings-only pnpm-workspace.yaml into
# dist/, and moves `onlyBuiltDependencies: [sharp]` into the pruned
# package.json, where pnpm 10 reads it. Copying the root file over that
# reintroduced `overrides` the lockfile no longer declares, and the frozen
# install below refused with ERR_PNPM_LOCKFILE_CONFIG_MISMATCH. sharp's
# install script still has to run — without it the failure moves to request
# time (hit once for astro:assets) — and the pruned package.json allows it.
# Installed here, inside the target image, on purpose — not copied in from
# the build stage's own node_modules. sharp ships prebuilt native binaries
# per platform (linuxmusl-x64 for this base image); installing on the
# actual target platform is what makes pnpm fetch the right one, instead of
# whatever the build stage's own architecture happened to be.
#
# The pruned package.json here has no "packageManager" field (only the
# monorepo root's does, and that file doesn't ship in this stage), so the
# version is pinned by hand: left to pick for itself, the installer takes
# whatever pnpm is newest, which doesn't necessarily agree with the
# lockfile @nx/js:prune-lockfile just produced (hit this for real: a
# version drift broke --frozen-lockfile). It must stay in step with the
# root package.json's "packageManager".
RUN npm install --global pnpm@10.30.3 && pnpm install --prod --frozen-lockfile
# This is the production image, and the API reads it as such: the session
# cookie is `Secure` only here, and the env check refuses example secrets
# and Cloudflare's test captcha keys only here. It was never set, so every
# real deployment sent the session cookie without `Secure`.
ENV NODE_ENV=production
USER kometio
EXPOSE 3000
CMD ["node", "main.js"]
