# syntax=docker/dockerfile:1
#
# docs/adr/0042. apps/api has Nx's own prune tooling (prune-lockfile +
# copy-workspace-modules); apps/public-site and apps/editor-app don't, so
# this uses pnpm's own native equivalent instead: `pnpm deploy`. Verified
# directly (not assumed) that `pnpm deploy` respects .gitignore and drops
# the (gitignored) `dist/` build output — it has to be copied in as a
# separate step after the deploy, not before it.
#
# `--legacy`: pnpm 10's default deploy mode requires
# `inject-workspace-packages=true`, a workspace-wide setting that changes
# how every workspace: dependency is linked everywhere, not just for
# Docker builds — too broad a change for what this needs. `--legacy`
# deploys from the existing lockfile/store without that requirement.

# The `builder` stage is published on its own, as
# ghcr.io/<owner>/kometio-public-site-builder (docs/adr/0089): the whole
# workspace with its dependencies installed, and nothing built yet. A theme
# kept in its own repository is copied into it under themes/<name>/ and
# built with tools/build-public-site-with-theme.mjs — see
# docs/creating-a-theme.md, "Shipping it".
FROM node:24-alpine AS builder
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
# config-load time and throws on a missing VITE_API_URL. .env is
# deliberately excluded from the build context; this placeholder copy of
# .env.example only exists to satisfy that graph parse.
RUN cp .env.example .env
RUN pnpm install --frozen-lockfile
# The themes Kometio ships. The theme build refuses one of these names, so a
# theme copied in cannot silently replace one of them for every site.
RUN find themes -mindepth 2 -maxdepth 2 -name theme.json | cut -d/ -f2 | sort > .kometio-core-themes

FROM builder AS build
# docs/adr/0042 — every theme under themes/* bundles into this image,
# unconditionally; which one a site renders with is `Site.themeName`,
# resolved per request (theme-registry.ts). `KOMETIO_THEME` is not a build
# arg: it's an optional *runtime* env var read by that same file to
# restrict which of the bundled themes a deployment will actually serve
# (an agency shipping only its own theme to a client). Deliberately not
# done by pruning themes/ before this build — tried that first and it
# breaks for real: the workspace's own tsconfig project references
# (maintained by `nx sync`) still point at the removed directory, so
# `astro build` fails with "Tsconfig not found /workspace/themes/<name>".
# The themes' own source is a few KB either way; the size argument for
# pruning never justified that fragility.
RUN pnpm nx run @kometio/public-site:build
RUN pnpm --filter @kometio/public-site deploy --prod --legacy /workspace/deploy/public-site
RUN cp -r /workspace/apps/public-site/dist /workspace/deploy/public-site/dist

FROM node:24-alpine AS runtime
WORKDIR /app
RUN addgroup -S kometio && adduser -S kometio -G kometio
COPY --from=build /workspace/deploy/public-site/ ./
USER kometio
# server.mjs falls back to 8080 when neither PUBLIC_SITE_PORT nor PORT is
# set — without this the image would listen on a different port than the
# one it EXPOSEs (and than docker-compose.prod.yml's healthcheck probes),
# so a plain `docker run -p 4321:4321 <image>` answered nothing. Compose
# sets PORT explicitly anyway; this is for everyone who doesn't.
ENV PORT=4321
EXPOSE 4321
CMD ["node", "server.mjs"]
