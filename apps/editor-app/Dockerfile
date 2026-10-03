# syntax=docker/dockerfile:1
#
# docs/adr/0042. A pure static SPA build — no Node runtime needed to serve
# it, so the runtime stage is nginx, not node:24-alpine (lighter for a
# container whose only job is serving static files + an SPA fallback).
#
# The two addresses the browser needs — the API's and the public site's —
# and the captcha's public key are NOT baked in any more (docs/adr/0076):
# the entrypoint below writes them into /config.js at start, from
# KOMETIO_API_URL, KOMETIO_PUBLIC_SITE_URL and KOMETIO_TURNSTILE_SITE_KEY,
# and nginx builds its Content-Security-Policy header from the addresses.
# One published image therefore serves any domain and any captcha key;
# changing one is a restart, not a rebuild.
#
# The VITE_* build args stay as the fallback compiled into the bundle (a
# dist/ served by some other static host, or a container started with
# none of the variables set).

FROM node:24-alpine AS build
WORKDIR /workspace
# pnpm installed from the version package.json pins, not through corepack:
# corepack is deprecated in Node 24 and simply absent from the Node 25
# images, where `corepack enable` fails with "not found" and takes the
# whole build with it. One source of truth, and package.json first so a
# change to the source does not invalidate this layer.
COPY package.json ./
RUN npm install --global "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")"
COPY . .
RUN pnpm install --frozen-lockfile
ARG VITE_API_URL=http://localhost:3000/api
ARG VITE_PUBLIC_SITE_URL=http://localhost:4322
ARG VITE_TURNSTILE_SITE_KEY
ENV VITE_API_URL=${VITE_API_URL} \
    VITE_PUBLIC_SITE_URL=${VITE_PUBLIC_SITE_URL} \
    VITE_TURNSTILE_SITE_KEY=${VITE_TURNSTILE_SITE_KEY}
RUN pnpm nx run @kometio/editor-app:build

FROM nginx:alpine AS runtime
COPY --from=build /workspace/apps/editor-app/dist/ /usr/share/nginx/html/
# A template under /etc/nginx/templates, not a finished conf: the image's
# own entrypoint runs envsubst over it at start. The filter keeps that
# substitution to KOMETIO_* names, so nginx's `$uri` is left alone.
COPY apps/editor-app/nginx.conf.template /etc/nginx/templates/default.conf.template
ENV NGINX_ENVSUBST_FILTER=^KOMETIO_
# Sourced (not executed) by the entrypoint, before the envsubst step, so
# the API origin it derives reaches the policy header. `--chmod` is not
# decoration: nginx's entrypoint skips a `.envsh` that is not executable,
# with one line in the log, and the container then dies on the
# unsubstituted `${KOMETIO_API_ORIGIN}` in its own config.
COPY --chmod=0755 apps/editor-app/docker-runtime-config.envsh /docker-entrypoint.d/10-kometio-runtime-config.envsh
EXPOSE 80
